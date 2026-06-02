import { useMemo, useState } from 'react';
import BetCard from '../components/BetCard';
import Leaderboard from '../components/Leaderboard';
import PoolManager from '../components/PoolManager';
import { useBets, useMyBetsMap } from '../hooks/useBets';
import { useCompetition } from '../hooks/useCompetition';
import { usePools } from '../hooks/usePools';
import { useLanguage } from '../i18n/LanguageContext';

const COMPETITION_ID = 'ranking-sandbox';
const SANDBOX_POOL_ID = 'ranking-sandbox-pool';
const SANDBOX_INVITE_CODE = 'RANKTEST';
const SETUP_ACTION_URL = 'https://github.com/leojaime20/Bolao/actions/workflows/setup-ranking-sandbox.yml';
const ADVANCE_ACTION_URL = 'https://github.com/leojaime20/Bolao/actions/workflows/score-ranking-sandbox.yml';

const phaseLabels = {
  groups: 'Fase de grupos',
  quarterfinals: 'Quartas de final',
  semifinals: 'Semifinais',
  finals: 'Disputa de terceiro e final',
  complete: 'Torneio completo',
};

function groupByDate(matches) {
  return matches.reduce((acc, match) => {
    if (!acc[match.date]) acc[match.date] = [];
    acc[match.date].push(match);
    return acc;
  }, {});
}

export default function LibertadoresTest() {
  const [view, setView] = useState('bet');
  const { t } = useLanguage();
  const { activePoolId, activePool } = usePools();
  const { competition, matches, loading: loadingMatches, error } = useCompetition(COMPETITION_ID);
  const { saveBet } = useBets(COMPETITION_ID);
  const { betsMap, setBetsMap, loading } = useMyBetsMap(COMPETITION_ID);
  const matchesByDate = useMemo(() => groupByDate(matches), [matches]);
  const isSandboxPool = activePoolId === SANDBOX_POOL_ID;

  const handleSave = async (matchId, scoreA, scoreB) => {
    await saveBet(String(matchId), scoreA, scoreB);
    setBetsMap((prev) => ({
      ...prev,
      [String(matchId)]: { ...prev[String(matchId)], predictedScoreA: scoreA, predictedScoreB: scoreB },
    }));
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

  if (!isSandboxPool) {
    return (
      <div className="bets libertadores">
        <div className="bets__no-pool">
          <span className="bets__no-pool-icon">🧪</span>
          <h2 className="bets__no-pool-title">{t('sandboxPoolRequired')}</h2>
          <p className="bets__no-pool-desc">
            {t('sandboxPoolRequiredDesc').replace('{code}', SANDBOX_INVITE_CODE)}
          </p>
        </div>
        <PoolManager />
      </div>
    );
  }

  return (
    <div className="bets libertadores">
      <div className="bets__pool-header">
        <span className="bets__pool-name">{activePool?.name}</span>
        <span className="bets__pool-code">{competition?.name || t('libertadoresTitle')}</span>
      </div>

      <div className="libertadores__intro">
        <div>
          <h2>{competition?.name || t('libertadoresTitle')}</h2>
          <p>{t('sandboxIntro')}</p>
          {competition?.sandboxPhase && (
            <p>
              Fase atual: <strong>{phaseLabels[competition.sandboxPhase] || competition.sandboxPhase}</strong>
            </p>
          )}
        </div>
      </div>

      <div className="libertadores__admin">
        <a className="admin__btn admin__btn--primary" href={SETUP_ACTION_URL} target="_blank" rel="noreferrer">
          Recriar sandbox no GitHub
        </a>
        <a className="admin__btn" href={ADVANCE_ACTION_URL} target="_blank" rel="noreferrer">
          Avançar fase no GitHub
        </a>
      </div>

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
      ) : error ? (
        <div className="bets__no-pool"><p className="bets__no-pool-desc">{error}</p></div>
      ) : matches.length === 0 ? (
        <div className="bets__no-pool">
          <span className="bets__no-pool-icon">⚽</span>
          <h2 className="bets__no-pool-title">Nenhum jogo importado</h2>
          <p className="bets__no-pool-desc">O administrador deve recriar o sandbox no GitHub Actions.</p>
        </div>
      ) : (
        <div className="bets__list">
          {Object.entries(matchesByDate).map(([date, dateMatches]) => (
            <div key={date} className="schedule__day">
              <h3 className="schedule__day-label">
                {new Date(`${date}T00:00:00`).toLocaleDateString(t('dateLocale'), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h3>
              {dateMatches.map((match) => (
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
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
