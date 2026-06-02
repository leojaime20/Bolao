import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { calculateMatchPoints, calculatePodiumPoints } from './scoring.mjs';

const API_BASE = 'https://api.football-data.org/v4';
const apiToken = process.env.FOOTBALL_DATA_API_KEY;
const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const requestedCompetition = process.argv[2] && process.argv[2] !== 'all'
  ? process.argv[2]
  : null;

const DEFAULT_COMPETITIONS = {
  'worldcup-2026': {
    name: 'Copa do Mundo 2026',
    apiProvider: 'football-data',
    apiCode: 'WC',
    season: 2026,
    enabled: true,
    syncEnabled: true,
    isTest: false,
    podiumPredictionEnabled: true,
    podiumPredictionDeadline: Timestamp.fromDate(new Date('2026-06-11T19:00:00Z')),
    sortOrder: 1,
  },
};

if (!apiToken) throw new Error('Missing FOOTBALL_DATA_API_KEY secret.');
if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function competitionRef(competitionId) {
  return db.collection('competitions').doc(competitionId);
}

function poolCompetitionRef(poolId, competitionId) {
  return db.collection('pools').doc(poolId).collection('competitions').doc(competitionId);
}

function mapApiStatus(status) {
  if (status === 'FINISHED') return 'finished';
  if (status === 'IN_PLAY' || status === 'PAUSED') return 'live';
  return 'upcoming';
}

function normalizeApiMatch(match) {
  const fullTime = match.score?.fullTime || {};
  const hasScore = fullTime.home != null && fullTime.away != null;
  return {
    apiMatchId: match.id,
    date: match.utcDate.slice(0, 10),
    utcDate: match.utcDate,
    kickoffAt: Timestamp.fromDate(new Date(match.utcDate)),
    kickoff_bst: new Date(match.utcDate).toISOString().slice(11, 16),
    home: match.homeTeam?.shortName || match.homeTeam?.name || 'TBD',
    away: match.awayTeam?.shortName || match.awayTeam?.name || 'TBD',
    home_crest: match.homeTeam?.crest || null,
    away_crest: match.awayTeam?.crest || null,
    group_label: match.group || '',
    matchday: match.matchday || null,
    stage: match.stage || '',
    status: mapApiStatus(match.status),
    apiStatus: match.status,
    scoreHome: hasScore ? fullTime.home : null,
    scoreAway: hasScore ? fullTime.away : null,
    winner: match.score?.winner || null,
    isPlayable: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function fetchApiMatches(competition) {
  const params = new URLSearchParams();
  if (competition.season) params.set('season', String(competition.season));
  const response = await fetch(`${API_BASE}/competitions/${competition.apiCode}/matches?${params}`, {
    headers: { 'X-Auth-Token': apiToken },
  });
  console.log(
    `football-data ${competition.apiCode}: HTTP ${response.status}; `
    + `remaining/minute=${response.headers.get('x-requests-available-minute') || 'unknown'}; `
    + `reset=${response.headers.get('x-requestcounter-reset') || 'unknown'}`
  );
  if (!response.ok) {
    throw new Error(`football-data ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }
  return response.json();
}

async function syncCompetitionMatches(competitionId, config) {
  if (!config.enabled || !config.apiCode) {
    throw new Error(`Competition ${competitionId} is not enabled or has no API code.`);
  }
  const apiData = await fetchApiMatches(config);
  const matches = apiData.matches || [];
  const firstKickoff = matches.reduce((earliest, match) => {
    const kickoff = new Date(match.utcDate);
    return !earliest || kickoff < earliest ? kickoff : earliest;
  }, null);
  let batch = db.batch();
  let count = 0;

  for (const apiMatch of matches) {
    batch.set(
      competitionRef(competitionId).collection('matches').doc(String(apiMatch.id)),
      normalizeApiMatch(apiMatch),
      { merge: true }
    );
    count += 1;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400) await batch.commit();

  const metadata = {
    lastSyncAt: FieldValue.serverTimestamp(),
    lastSyncStatus: 'success',
    lastSyncMatchCount: matches.length,
    lastSyncError: FieldValue.delete(),
  };
  if (config.podiumPredictionEnabled != null && firstKickoff) {
    metadata.podiumPredictionDeadline = Timestamp.fromDate(firstKickoff);
  }
  await competitionRef(competitionId).set(metadata, { merge: true });
  return matches.length;
}

async function scoreCompetitionPools(competitionId, config) {
  const finishedSnapshot = await competitionRef(competitionId).collection('matches')
    .where('status', '==', 'finished')
    .get();
  const finished = new Map(finishedSnapshot.docs.map((match) => [match.id, match.data()]));
  const poolsSnapshot = await db.collection('pools').get();
  const canScorePodium = config.podiumPredictionEnabled === true && Boolean(config.officialPodium);
  let scoredBets = 0;
  let scoredPredictions = 0;

  for (const pool of poolsSnapshot.docs) {
    const root = poolCompetitionRef(pool.id, competitionId);
    const bets = await root.collection('bets').get();
    const userTotals = new Map();
    let batch = db.batch();
    let batchCount = 0;

    for (const betDoc of bets.docs) {
      const bet = betDoc.data();
      const match = finished.get(String(bet.matchId));
      if (!match) continue;
      const result = calculateMatchPoints(
        bet.predictedScoreA,
        bet.predictedScoreB,
        match.scoreHome,
        match.scoreAway
      );
      if (!result) continue;
      const total = userTotals.get(bet.userId) || { matchPoints: 0, exact: 0, outcome: 0 };
      total.matchPoints += result.points;
      if (result.type === 'exact') total.exact += 1;
      if (result.type === 'outcome') total.outcome += 1;
      userTotals.set(bet.userId, total);

      if (bet.pointsAwarded !== result.points || bet.scoreType !== result.type) {
        batch.set(betDoc.ref, {
          pointsAwarded: result.points,
          scoreType: result.type,
          scoredAt: FieldValue.serverTimestamp(),
          scoredScoreHome: match.scoreHome,
          scoredScoreAway: match.scoreAway,
        }, { merge: true });
        scoredBets += 1;
        batchCount += 1;
        if (batchCount === 400) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }
    if (batchCount) await batch.commit();

    const predictions = await root.collection('podiumPredictions').get();
    for (const predictionDoc of predictions.docs) {
      const prediction = predictionDoc.data();
      const bonusPoints = canScorePodium
        ? calculatePodiumPoints(prediction, config.officialPodium)
        : 0;
      const totals = userTotals.get(predictionDoc.id) || { matchPoints: 0, exact: 0, outcome: 0 };
      totals.bonusPoints = bonusPoints;
      userTotals.set(predictionDoc.id, totals);
      if (canScorePodium && prediction.bonusPoints !== bonusPoints) {
        await predictionDoc.ref.set({ bonusPoints, scoredAt: FieldValue.serverTimestamp() }, { merge: true });
        scoredPredictions += 1;
      }
    }

    for (const [uid, totals] of userTotals.entries()) {
      const leaderboard = root.collection('leaderboard').doc(uid);
      const current = (await leaderboard.get()).data() || {};
      const bonusPoints = totals.bonusPoints ?? current.bonusPoints ?? 0;
      await leaderboard.set({
        matchPoints: totals.matchPoints,
        bonusPoints,
        totalPoints: totals.matchPoints + bonusPoints,
        exactResultsCount: totals.exact,
        correctOutcomeCount: totals.outcome,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  return { scoredBets, scoredPredictions };
}

async function runCompetition(competitionId) {
  const ref = competitionRef(competitionId);
  let snapshot = await ref.get();
  if (!snapshot.exists && DEFAULT_COMPETITIONS[competitionId]) {
    await ref.set(DEFAULT_COMPETITIONS[competitionId], { merge: true });
    snapshot = await ref.get();
  }
  if (!snapshot.exists) throw new Error(`Competition ${competitionId} does not exist in Firestore.`);
  const config = snapshot.data();
  try {
    const importedMatches = await syncCompetitionMatches(competitionId, config);
    const scores = await scoreCompetitionPools(competitionId, (await ref.get()).data());
    console.log(`${competitionId}: ${importedMatches} matches imported; ${scores.scoredBets} bets scored.`);
  } catch (error) {
    await ref.set({
      lastSyncAt: FieldValue.serverTimestamp(),
      lastSyncStatus: 'error',
      lastSyncError: error.message,
    }, { merge: true });
    throw error;
  }
}

const competitionIds = requestedCompetition
  ? [requestedCompetition]
  : (await db.collection('competitions').where('syncEnabled', '==', true).get()).docs.map((doc) => doc.id);

if (competitionIds.length === 0) throw new Error('No competition selected for synchronization.');

for (const competitionId of competitionIds) {
  await runCompetition(competitionId);
}

console.log('Results update complete.');
