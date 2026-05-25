import { useState, useMemo } from 'react';
import BetCard from '../components/BetCard';
import Leaderboard from '../components/Leaderboard';
import PodiumPrediction from '../components/PodiumPrediction';
import PoolManager from '../components/PoolManager';
import { useLanguage } from '../i18n/LanguageContext';
import { useBets, useMyBetsMap } from '../hooks/useBets';
import { useCompetition } from '../hooks/useCompetition';
import { usePools } from '../hooks/usePools';

const COMPETITION_ID = 'worldcup-2026';

export default function Bets({ onTeamClick }) {
  const [view, setView] = useState('bet');
  const { t } = useLanguage();
  const { activePoolId, activePool } = usePools();
  const { competition, matches, loading: loadingMatches } = useCompetition(COMPETITION_ID);
  const { saveBet } = useBets(COMPETITION_ID);
  const { betsMap, setBetsMap, loading } = useMyBetsMap(COMPETITION_ID);

  const matchesByDate = useMemo(() => {
    const grouped = {};
    for (const match of matches) {
      if (!grouped[match.date]) grouped[match.date] = [];
      grouped[match.date].push(match);
    }
    return grouped;
  }, [matches]);

  const handleSave = async (matchId, scoreA, scoreB) => {
    await saveBet(matchId, scoreA, scoreB);
    setBetsMap((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], predictedScoreA: scoreA, predictedScoreB: scoreB },
    }));
  };

  // No active pool — show CTA
  if (!activePoolId) {
    return (
      <div className="bets">
        <div className="bets__no-pool">
          <span className="bets__no-pool-icon">🎯</span>
          <h2 className="bets__no-pool-title">{t('poolRequired')}</h2>
          <p className="bets__no-pool-desc">{t('poolRequiredDesc')}</p>
        </div>
        <PoolManager />
      </div>
    );
  }

  return (
    <div className="bets">
      {activePool && (
        <div className="bets__pool-header">
          <span className="bets__pool-name">{activePool.name}</span>
          <span className="bets__pool-code">{activePool.inviteCode}</span>
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
          className={`teams__view-chip ${view === 'podium' ? 'teams__view-chip--active' : ''}`}
          onClick={() => setView('podium')}
        >
          🏆 Podio
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
      ) : view === 'podium' ? (
        <PodiumPrediction competitionId={COMPETITION_ID} competition={competition} />
      ) : (
        <>
          {loading || loadingMatches ? (
            <div className="bets__loading">{t('loading')}</div>
          ) : matches.length === 0 ? (
            <div className="bets__no-pool">
              <span className="bets__no-pool-icon">⚽</span>
              <h2 className="bets__no-pool-title">Jogos aguardando importacao</h2>
              <p className="bets__no-pool-desc">O administrador deve sincronizar a Copa no portal admin.</p>
            </div>
          ) : (
            <div className="bets__list">
              {Object.entries(matchesByDate).map(([date, matches]) => {
                const d = new Date(date + 'T00:00:00');
                const label = d.toLocaleDateString(t('dateLocale'), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                });

                return (
                  <div key={date} className="schedule__day">
                    <h3 className="schedule__day-label">{label}</h3>
                    {matches.map((match) => (
                      <BetCard
                        key={match.id}
                        match={match}
                        bet={betsMap[match.id]}
                        matchScore={{
                          status: match.status,
                          scoreHome: match.scoreHome,
                          scoreAway: match.scoreAway,
                        }}
                        onSave={handleSave}
                        onTeamClick={onTeamClick}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
