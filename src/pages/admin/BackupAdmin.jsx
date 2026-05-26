import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import schedule from '../../data/schedule.json';

const SCORING_RULES = {
  match: {
    exactScore: 5,
    correctOutcome: 3,
    oneTeamGoalsOnly: 1,
    miss: 0,
    nonCumulative: true,
  },
  podium: {
    champion: 10,
    runnerUp: 6,
    thirdPlace: 4,
    perfectExtra: 3,
    wrongPositionFactor: 'half_rounded_up',
  },
};

function serializeValue(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)])
    );
  }
  return value;
}

function snapshotRows(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...serializeValue(item.data()) }));
}

function csvCell(value) {
  if (value == null) return '';
  return `"${String(value).replaceAll('"', '""')}"`;
}

function createCsv(headers, rows) {
  return [
    headers.map(csvCell).join(';'),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(';')),
  ].join('\n');
}

function downloadFile(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BackupAdmin() {
  const [backup, setBackup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [usersSnapshot, poolsSnapshot, competitionsSnapshot, legacyResultsSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'pools')),
        getDocs(collection(db, 'competitions')),
        getDocs(collection(db, 'matchResults')),
      ]);
      const users = snapshotRows(usersSnapshot);
      const pools = snapshotRows(poolsSnapshot);
      const competitions = snapshotRows(competitionsSnapshot);
      const usersById = Object.fromEntries(users.map((user) => [user.id, user]));
      const legacyResults = snapshotRows(legacyResultsSnapshot);
      const legacyResultsById = Object.fromEntries(legacyResults.map((result) => [result.id, result]));
      const legacyMatchesById = Object.fromEntries(
        schedule.phases.flatMap((phase) => phase.matches).map((match) => [String(match.id), match])
      );
      const matchRows = [];
      const podiumRows = [];
      const leaderboardRows = [];
      const competitionData = [];
      const poolData = [];

      for (const competition of competitions) {
        const matches = snapshotRows(
          await getDocs(collection(db, 'competitions', competition.id, 'matches'))
        );
        competitionData.push({ ...competition, matches });
      }

      for (const pool of pools) {
        const legacyBets = snapshotRows(await getDocs(collection(db, 'pools', pool.id, 'bets')));
        const legacyLeaderboard = snapshotRows(await getDocs(collection(db, 'pools', pool.id, 'leaderboard')));
        const scopedCompetitions = [];

        for (const entry of legacyLeaderboard) {
          leaderboardRows.push({
            poolId: pool.id,
            poolName: pool.name,
            competitionId: 'legacy-worldcup',
            competitionName: 'Copa do Mundo - dados anteriores',
            userId: entry.id,
            nickname: entry.nickname || usersById[entry.id]?.nickname || '',
            matchPoints: entry.matchPoints ?? entry.totalPoints ?? 0,
            bonusPoints: entry.bonusPoints ?? 0,
            totalPoints: entry.totalPoints ?? 0,
            exactResultsCount: entry.exactResultsCount ?? 0,
            correctOutcomeCount: entry.correctOutcomeCount ?? 0,
          });
        }

        for (const bet of legacyBets) {
          const match = legacyMatchesById[String(bet.matchId)] || {};
          const result = legacyResultsById[String(bet.matchId)] || {};
          matchRows.push({
            poolId: pool.id,
            poolName: pool.name,
            competitionId: 'legacy-worldcup',
            competitionName: 'Copa do Mundo - dados anteriores',
            matchId: bet.matchId,
            kickoffAt: `${match.date || ''} ${match.kickoff_bst || ''}`.trim(),
            home: match.home,
            away: match.away,
            status: result.status || '',
            actualHome: result.scoreA ?? result.scoreHome,
            actualAway: result.scoreB ?? result.scoreAway,
            userId: bet.userId,
            nickname: usersById[bet.userId]?.nickname || '',
            predictedHome: bet.predictedScoreA,
            predictedAway: bet.predictedScoreB,
            pointsAwarded: bet.pointsAwarded,
            scoreType: bet.scoreType,
            betUpdatedAt: bet.updatedAt,
          });
        }

        for (const competition of competitionData) {
          const [betsSnapshot, leaderboardSnapshot, podiumSnapshot] = await Promise.all([
            getDocs(collection(db, 'pools', pool.id, 'competitions', competition.id, 'bets')),
            getDocs(collection(db, 'pools', pool.id, 'competitions', competition.id, 'leaderboard')),
            getDocs(collection(db, 'pools', pool.id, 'competitions', competition.id, 'podiumPredictions')),
          ]);
          const bets = snapshotRows(betsSnapshot);
          const leaderboard = snapshotRows(leaderboardSnapshot);
          const podiumPredictions = snapshotRows(podiumSnapshot);
          const matchesById = Object.fromEntries(competition.matches.map((match) => [match.id, match]));

          for (const entry of leaderboard) {
            leaderboardRows.push({
              poolId: pool.id,
              poolName: pool.name,
              competitionId: competition.id,
              competitionName: competition.name,
              userId: entry.id,
              nickname: entry.nickname || usersById[entry.id]?.nickname || '',
              matchPoints: entry.matchPoints ?? entry.totalPoints ?? 0,
              bonusPoints: entry.bonusPoints ?? 0,
              totalPoints: entry.totalPoints ?? 0,
              exactResultsCount: entry.exactResultsCount ?? 0,
              correctOutcomeCount: entry.correctOutcomeCount ?? 0,
            });
          }

          for (const bet of bets) {
            const match = matchesById[String(bet.matchId)] || {};
            matchRows.push({
              poolId: pool.id,
              poolName: pool.name,
              competitionId: competition.id,
              competitionName: competition.name,
              matchId: bet.matchId,
              kickoffAt: match.kickoffAt,
              home: match.home,
              away: match.away,
              status: match.status,
              actualHome: match.scoreHome,
              actualAway: match.scoreAway,
              userId: bet.userId,
              nickname: usersById[bet.userId]?.nickname || '',
              predictedHome: bet.predictedScoreA,
              predictedAway: bet.predictedScoreB,
              pointsAwarded: bet.pointsAwarded,
              scoreType: bet.scoreType,
              betUpdatedAt: bet.updatedAt,
            });
          }

          for (const prediction of podiumPredictions) {
            podiumRows.push({
              poolId: pool.id,
              poolName: pool.name,
              competitionId: competition.id,
              competitionName: competition.name,
              userId: prediction.userId,
              nickname: usersById[prediction.userId]?.nickname || '',
              predictedChampion: prediction.champion,
              predictedRunnerUp: prediction.runnerUp,
              predictedThirdPlace: prediction.thirdPlace,
              officialChampion: competition.officialPodium?.champion,
              officialRunnerUp: competition.officialPodium?.runnerUp,
              officialThirdPlace: competition.officialPodium?.thirdPlace,
              bonusPoints: prediction.bonusPoints,
              submittedAt: prediction.submittedAt,
            });
          }

          scopedCompetitions.push({
            competitionId: competition.id,
            bets,
            leaderboard,
            podiumPredictions,
          });
        }

        poolData.push({
          ...pool,
          legacyBets,
          legacyLeaderboard,
          competitions: scopedCompetitions,
        });
      }

      const result = {
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
        scoringRules: SCORING_RULES,
        users,
        competitions: competitionData,
        pools: poolData,
        legacyMatchResults: legacyResults,
        calculationRows: { matches: matchRows, podium: podiumRows, leaderboard: leaderboardRows },
      };
      setBackup(result);
      setMessage(`Backup preparado: ${matchRows.length} palpites de partidas, ${podiumRows.length} palpites de podio e ${leaderboardRows.length} linhas de ranking.`);
    } catch (error) {
      console.error('Backup generation failed:', error);
      setMessage('Falha ao preparar backup. Confirme que esta sessao e do administrador.');
    }
    setLoading(false);
  };

  const suffix = backup?.exportedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const matchHeaders = [
    'poolId', 'poolName', 'competitionId', 'competitionName', 'matchId', 'kickoffAt',
    'home', 'away', 'status', 'actualHome', 'actualAway', 'userId', 'nickname',
    'predictedHome', 'predictedAway', 'pointsAwarded', 'scoreType', 'betUpdatedAt',
  ];
  const podiumHeaders = [
    'poolId', 'poolName', 'competitionId', 'competitionName', 'userId', 'nickname',
    'predictedChampion', 'predictedRunnerUp', 'predictedThirdPlace', 'officialChampion',
    'officialRunnerUp', 'officialThirdPlace', 'bonusPoints', 'submittedAt',
  ];
  const leaderboardHeaders = [
    'poolId', 'poolName', 'competitionId', 'competitionName', 'userId', 'nickname',
    'matchPoints', 'bonusPoints', 'totalPoints', 'exactResultsCount', 'correctOutcomeCount',
  ];

  return (
    <div className="admin__section backup-admin">
      <h3>Backup e auditoria</h3>
      <p className="backup-admin__description">
        Gere uma copia completa antes e depois de cada actualizacao de resultados. O JSON preserva
        documentos e regras; os CSVs permitem recalcular ou conferir pontos em uma planilha.
      </p>
      <button className="admin__btn admin__btn--primary" onClick={handleGenerate} disabled={loading}>
        {loading ? 'Preparando...' : 'Preparar backup'}
      </button>
      {message && <p className="competition-admin__message">{message}</p>}
      {backup && (
        <div className="backup-admin__downloads">
          <button
            className="admin__btn admin__btn--ghost"
            onClick={() => downloadFile(
              JSON.stringify(backup, null, 2),
              `Copa-Yantai-backup-${suffix}.json`,
              'application/json;charset=utf-8'
            )}
          >
            Baixar JSON completo
          </button>
          <button
            className="admin__btn admin__btn--ghost"
            onClick={() => downloadFile(
              `\uFEFF${createCsv(matchHeaders, backup.calculationRows.matches)}`,
              `Copa-Yantai-palpites-partidas-${suffix}.csv`,
              'text/csv;charset=utf-8'
            )}
          >
            Baixar CSV partidas
          </button>
          <button
            className="admin__btn admin__btn--ghost"
            onClick={() => downloadFile(
              `\uFEFF${createCsv(podiumHeaders, backup.calculationRows.podium)}`,
              `Copa-Yantai-palpites-podio-${suffix}.csv`,
              'text/csv;charset=utf-8'
            )}
          >
            Baixar CSV podio
          </button>
          <button
            className="admin__btn admin__btn--ghost"
            onClick={() => downloadFile(
              `\uFEFF${createCsv(leaderboardHeaders, backup.calculationRows.leaderboard)}`,
              `Copa-Yantai-ranking-${suffix}.csv`,
              'text/csv;charset=utf-8'
            )}
          >
            Baixar CSV ranking
          </button>
        </div>
      )}
      <p className="backup-admin__note">
        O arquivo contem dados dos participantes e deve ser guardado em local restrito.
      </p>
    </div>
  );
}
