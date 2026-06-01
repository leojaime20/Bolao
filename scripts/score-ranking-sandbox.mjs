import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { calculateMatchPoints } from './scoring.mjs';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const COMPETITION_ID = 'ranking-sandbox';
const POOL_ID = 'ranking-sandbox-pool';

const RESULTS = [
  [2, 1],
  [1, 1],
  [0, 2],
  [3, 0],
  [2, 2],
  [1, 0],
  [0, 0],
  [4, 2],
  [2, 3],
  [1, 2],
];

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const competitionRef = db.collection('competitions').doc(COMPETITION_ID);
const poolCompetitionRef = db.collection('pools').doc(POOL_ID).collection('competitions').doc(COMPETITION_ID);

const matchBatch = db.batch();
RESULTS.forEach(([scoreHome, scoreAway], index) => {
  const matchId = `sandbox-${String(index + 1).padStart(2, '0')}`;
  matchBatch.set(competitionRef.collection('matches').doc(matchId), {
    status: 'finished',
    apiStatus: 'FINISHED',
    scoreHome,
    scoreAway,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});
await matchBatch.commit();

const betsSnapshot = await poolCompetitionRef.collection('bets').get();
const userTotals = new Map();
let batch = db.batch();
let batchCount = 0;
let scoredBets = 0;

for (const betDoc of betsSnapshot.docs) {
  const bet = betDoc.data();
  const matchNumber = Number(String(bet.matchId).replace('sandbox-', '')) - 1;
  const resultScore = RESULTS[matchNumber];
  if (!resultScore) continue;

  const result = calculateMatchPoints(
    bet.predictedScoreA,
    bet.predictedScoreB,
    resultScore[0],
    resultScore[1]
  );
  if (!result) continue;

  const totals = userTotals.get(bet.userId) || { matchPoints: 0, exact: 0, outcome: 0 };
  totals.matchPoints += result.points;
  if (result.type === 'exact') totals.exact += 1;
  if (result.type === 'outcome') totals.outcome += 1;
  userTotals.set(bet.userId, totals);

  batch.set(betDoc.ref, {
    pointsAwarded: result.points,
    scoreType: result.type,
    scoredAt: FieldValue.serverTimestamp(),
    scoredScoreHome: resultScore[0],
    scoredScoreAway: resultScore[1],
  }, { merge: true });
  scoredBets += 1;
  batchCount += 1;
  if (batchCount === 400) {
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  }
}
if (batchCount) await batch.commit();

for (const [uid, totals] of userTotals.entries()) {
  const leaderboard = poolCompetitionRef.collection('leaderboard').doc(uid);
  const current = (await leaderboard.get()).data() || {};
  await leaderboard.set({
    nickname: current.nickname || '',
    matchPoints: totals.matchPoints,
    bonusPoints: 0,
    totalPoints: totals.matchPoints,
    exactResultsCount: totals.exact,
    correctOutcomeCount: totals.outcome,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

await competitionRef.set({
  lastSyncAt: FieldValue.serverTimestamp(),
  lastSyncStatus: 'success',
  lastSyncMatchCount: RESULTS.length,
  sandboxScoredAt: FieldValue.serverTimestamp(),
}, { merge: true });

console.log(`Sandbox scored: ${scoredBets} bets scored for ${POOL_ID}.`);
