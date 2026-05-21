import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import BetCard from '../components/BetCard';
import Leaderboard from '../components/Leaderboard';
import PoolManager from '../components/PoolManager';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { poolSubcollection, poolSubdoc, useBets, useMyBetsMap } from '../hooks/useBets';
import { useCachedScores } from '../hooks/useLiveScores';
import { usePools } from '../hooks/usePools';
import { useLanguage } from '../i18n/LanguageContext';
import { getCompetitionMatches, mapApiStatus } from '../utils/footballApi';
import { calculatePoints } from '../utils/scoring';

const COMPETITION_ID = 'libertadores-test';
const COMPETITION_CODE = 'CLI';
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 21;

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatKickoff(utcDate) {
  return new Date(utcDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getApiScore(apiMatch) {
  const score = apiMatch.score || {};
  const fullTime = score.fullTime || {};
  if (fullTime.home == null || fullTime.away == null) return null;
  return { home: fullTime.home, away: fullTime.away };
}

function normalizeApiMatch(apiMatch) {
  return {
    id: String(apiMatch.id),
    apiMatchId: apiMatch.id,
    date: apiMatch.utcDate.slice(0, 10),
    kickoff_bst: formatKickoff(apiMatch.utcDate),
    home: apiMatch.homeTeam?.shortName || apiMatch.homeTeam?.name || 'TBD',
    away: apiMatch.awayTeam?.shortName || apiMatch.awayTeam?.name || 'TBD',
    home_crest: apiMatch.homeTeam?.crest,
    away_crest: apiMatch.awayTeam?.crest,
    group_label: apiMatch.group || apiMatch.matchday ? `Jornada ${apiMatch.matchday}` : '',
    venue: apiMatch.venue || '',
    city: '',
    status: mapApiStatus(apiMatch.status),
    apiStatus: apiMatch.status,
    score: getApiScore(apiMatch),
    isPlayable: Boolean(apiMatch.homeTeam?.id && apiMatch.awayTeam?.id),
  };
}

function groupByDate(matches) {
  return matches.reduce((acc, match) => {
    if (!acc[match.date]) acc[match.date] = [];
    acc[match.date].push(match);
    return acc;
  }, {});
}

async function scoreCompetitionForAllPools({ competitionId, match, scoreA, scoreB }) {
  const poolsSnap = await getDocs(collection(db, 'pools'));

  for (const poolDoc of poolsSnap.docs) {
    const poolId = poolDoc.id;
    await setDoc(poolSubdoc(poolId, competitionId, 'matches', String(match.id)), {
      matchId: String(match.id),
      apiMatchId: match.apiMatchId,
      status: 'finished',
      scoreHome: scoreA,
      scoreAway: scoreB,
      home: match.home,
      away: match.away,
      updatedAt: new Date(),
    }, { merge: true });

    const betsSnap = await getDocs(
      query(
        poolSubcollection(poolId, competitionId, 'bets'),
        where('matchId', '==', String(match.id))
      )
    );

    if (betsSnap.empty) continue;

    const batch = writeBatch(db);
    const leaderboardUpdates = {};

    for (const betDoc of betsSnap.docs) {
      const bet = betDoc.data();
      const result = calculatePoints(
        bet.predictedScoreA,
        bet.predictedScoreB,
        scoreA,
        scoreB
      );
      if (!result) continue;

      const previousPoints = bet.pointsAwarded ?? 0;
      const previousType = bet.scoreType || null;
      const pointsDelta = result.points - previousPoints;
      const exactDelta = (result.type === 'exact' ? 1 : 0) - (previousType === 'exact' ? 1 : 0);
      const outcomeDelta = (result.type === 'outcome' ? 1 : 0) - (previousType === 'outcome' ? 1 : 0);

      batch.update(betDoc.ref, {
        pointsAwarded: result.points,
        scoreType: result.type,
        scoredAt: new Date(),
      });

      if (!leaderboardUpdates[bet.userId]) {
        leaderboardUpdates[bet.userId] = { points: 0, exact: 0, outcome: 0 };
      }
      leaderboardUpdates[bet.userId].points += pointsDelta;
      leaderboardUpdates[bet.userId].exact += exactDelta;
      leaderboardUpdates[bet.userId].outcome += outcomeDelta;
    }

    await batch.commit();

    for (const [uid, delta] of Object.entries(leaderboardUpdates)) {
      const lbRef = poolSubdoc(poolId, competitionId, 'leaderboard', uid);
      const lbSnap = await getDoc(lbRef);
      const current = lbSnap.exists() ? lbSnap.data() : {};
      await setDoc(lbRef, {
        ...current,
        totalPoints: Math.max(0, (current.totalPoints || 0) + delta.points),
        exactResultsCount: Math.max(0, (current.exactResultsCount || 0) + delta.exact),
        correctOutcomeCount: Math.max(0, (current.correctOutcomeCount || 0) + delta.outcome),
      }, { merge: true });
    }
  }
}

export default function LibertadoresTest() {
  const [view, setView] = useState('bet');
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const { t } = useLanguage();
  const { user } = useAuth();
  const { activePoolId, activePool } = usePools();
  const { saveBet } = useBets(COMPETITION_ID);
  const { betsMap, setBetsMap, loading } = useMyBetsMap(COMPETITION_ID);
  const cachedScores = useCachedScores(COMPETITION_ID);
  const isAdmin = user?.uid && user.uid === import.meta.env.VITE_ADMIN_UID;

  const loadMatches = useCallback(async () => {
    setLoadingMatches(true);
    setLoadError('');
    try {
      const data = await getCompetitionMatches(COMPETITION_CODE, {
        dateFrom: dateOffset(-LOOKBACK_DAYS),
        dateTo: dateOffset(LOOKAHEAD_DAYS),
      });
      setMatches((data.matches || []).map(normalizeApiMatch));
    } catch (err) {
      console.error('Libertadores load failed:', err);
      setLoadError(t('libertadoresLoadError'));
    }
    setLoadingMatches(false);
  }, [t]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const matchesByDate = useMemo(() => groupByDate(matches), [matches]);

  const handleSave = async (matchId, scoreA, scoreB) => {
    await saveBet(String(matchId), scoreA, scoreB);
    setBetsMap((prev) => ({
      ...prev,
      [String(matchId)]: { ...prev[String(matchId)], predictedScoreA: scoreA, predictedScoreB: scoreB },
    }));
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const finished = matches.filter((match) => match.status === 'finished' && match.score);
      for (const match of finished) {
        await scoreCompetitionForAllPools({
          competitionId: COMPETITION_ID,
          match,
          scoreA: match.score.home,
          scoreB: match.score.away,
        });
      }
      setSyncMessage(t('libertadoresSyncDone').replace('{count}', String(finished.length)));
    } catch (err) {
      console.error('Libertadores sync failed:', err);
      setSyncMessage(t('libertadoresSyncError'));
    }
    setSyncing(false);
  };

  if (!activePoolId) {
    return (
      <div className="bets">
        <div className="bets__no-pool">
          <span className="bets__no-pool-icon">🏆</span>
          <h2 className="bets__no-pool-title">{t('poolRequired')}</h2>
          <p className="bets__no-pool-desc">{t('poolRequiredDesc')}</p>
        </div>
        <PoolManager />
      </div>
    );
  }

  return (
    <div className="bets libertadores">
      <div className="bets__pool-header">
        <span className="bets__pool-name">{activePool?.name}</span>
        <span className="bets__pool-code">{t('libertadoresTitle')}</span>
      </div>

      <div className="libertadores__intro">
        <div>
          <h2>{t('libertadoresTitle')}</h2>
          <p>{t('libertadoresDesc')}</p>
        </div>
        <button className="admin__btn admin__btn--ghost admin__btn--small" onClick={loadMatches}>
          {t('refresh')}
        </button>
      </div>

      {isAdmin && (
        <div className="libertadores__admin">
          <button className="admin__btn admin__btn--primary" onClick={handleSync} disabled={syncing || loadingMatches}>
            {syncing ? t('saving') : t('libertadoresSync')}
          </button>
          {syncMessage && <span className="libertadores__sync-message">{syncMessage}</span>}
        </div>
      )}

      <div className="bets__view-toggle">
        <button
          className={`teams__view-chip ${view === 'bet' ? 'teams__view-chip--active' : ''}`}
          onClick={() => setView('bet')}
        >
          🎯 {t('betTab')}
        </button>
        <button
          className={`teams__view-chip ${view === 'ranking' ? 'teams__view-chip--active' : ''}`}
          onClick={() => setView('ranking')}
        >
          🏅 {t('rankingTab')}
        </button>
      </div>

      {view === 'ranking' ? (
        <Leaderboard competitionId={COMPETITION_ID} />
      ) : loadingMatches || loading ? (
        <div className="bets__loading">{t('loading')}</div>
      ) : loadError ? (
        <div className="bets__no-pool">
          <span className="bets__no-pool-icon">⚠️</span>
          <h2 className="bets__no-pool-title">{loadError}</h2>
        </div>
      ) : (
        <div className="bets__list">
          {Object.entries(matchesByDate).map(([date, dateMatches]) => {
            const d = new Date(date + 'T00:00:00');
            const label = d.toLocaleDateString(t('dateLocale'), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            });

            return (
              <div key={date} className="schedule__day">
                <h3 className="schedule__day-label">{label}</h3>
                {dateMatches.map((match) => {
                  const apiScore = match.score
                    ? {
                        status: match.status,
                        scoreHome: match.score.home,
                        scoreAway: match.score.away,
                      }
                    : { status: match.status };
                  return (
                    <BetCard
                      key={match.id}
                      match={match}
                      bet={betsMap[match.id]}
                      matchScore={cachedScores[String(match.id)] || apiScore}
                      onSave={handleSave}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
