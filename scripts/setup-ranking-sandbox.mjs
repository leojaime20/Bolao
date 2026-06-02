import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const adminUid = process.env.ADMIN_UID || process.env.VITE_ADMIN_UID;

const COMPETITION_ID = 'ranking-sandbox';
const POOL_ID = 'ranking-sandbox-pool';
const POOL_NAME = 'Teste Ranking';
const INVITE_CODE = 'RANKTEST';
const BETTING_WINDOW_HOURS = 12;

const teams = [
  { name: 'Brasil Teste', group: 'A' },
  { name: 'China Teste', group: 'A' },
  { name: 'Portugal Teste', group: 'A' },
  { name: 'Argentina Teste', group: 'A' },
  { name: 'Franca Teste', group: 'B' },
  { name: 'Espanha Teste', group: 'B' },
  { name: 'Inglaterra Teste', group: 'B' },
  { name: 'Italia Teste', group: 'B' },
  { name: 'Alemanha Teste', group: 'C' },
  { name: 'Holanda Teste', group: 'C' },
  { name: 'Japao Teste', group: 'C' },
  { name: 'Coreia Teste', group: 'C' },
  { name: 'Mexico Teste', group: 'D' },
  { name: 'Uruguai Teste', group: 'D' },
  { name: 'Colombia Teste', group: 'D' },
  { name: 'Chile Teste', group: 'D' },
];

const groupFixtures = [
  ['g-01', 'Brasil Teste', 'China Teste', 'A'],
  ['g-02', 'Portugal Teste', 'Argentina Teste', 'A'],
  ['g-03', 'Brasil Teste', 'Portugal Teste', 'A'],
  ['g-04', 'China Teste', 'Argentina Teste', 'A'],
  ['g-05', 'Franca Teste', 'Espanha Teste', 'B'],
  ['g-06', 'Inglaterra Teste', 'Italia Teste', 'B'],
  ['g-07', 'Franca Teste', 'Inglaterra Teste', 'B'],
  ['g-08', 'Espanha Teste', 'Italia Teste', 'B'],
  ['g-09', 'Alemanha Teste', 'Holanda Teste', 'C'],
  ['g-10', 'Japao Teste', 'Coreia Teste', 'C'],
  ['g-11', 'Alemanha Teste', 'Japao Teste', 'C'],
  ['g-12', 'Holanda Teste', 'Coreia Teste', 'C'],
  ['g-13', 'Mexico Teste', 'Uruguai Teste', 'D'],
  ['g-14', 'Colombia Teste', 'Chile Teste', 'D'],
  ['g-15', 'Mexico Teste', 'Colombia Teste', 'D'],
  ['g-16', 'Uruguai Teste', 'Chile Teste', 'D'],
];

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
if (!adminUid) throw new Error('Missing ADMIN_UID/VITE_ADMIN_UID secret.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function deleteCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  if (snapshot.empty) return;

  let batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count += 1;
    if (count === 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count) await batch.commit();
}

function kickoffBase() {
  const startsAt = new Date(Date.now() + BETTING_WINDOW_HOURS * 60 * 60 * 1000);
  startsAt.setSeconds(0, 0);
  return startsAt;
}

function matchDoc({ id, home, away, kickoffAt, matchday, groupLabel, stage, label, isPlayable = true }) {
  return {
    apiMatchId: `sandbox-${id}`,
    date: kickoffAt.toISOString().slice(0, 10),
    utcDate: kickoffAt.toISOString(),
    kickoffAt: Timestamp.fromDate(kickoffAt),
    kickoff_bst: kickoffAt.toISOString().slice(11, 16),
    home,
    away,
    home_crest: null,
    away_crest: null,
    group_label: groupLabel || '',
    matchday,
    stage,
    label: label || '',
    status: 'upcoming',
    apiStatus: 'SCHEDULED',
    scoreHome: null,
    scoreAway: null,
    winner: null,
    isPlayable,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

const userSnap = await db.collection('users').doc(adminUid).get();
const adminNickname = userSnap.exists ? userSnap.data().nickname || '' : '';

const poolRef = db.collection('pools').doc(POOL_ID);
const poolCompetitionRef = poolRef.collection('competitions').doc(COMPETITION_ID);
const competitionRef = db.collection('competitions').doc(COMPETITION_ID);

await Promise.all([
  deleteCollection(competitionRef.collection('matches')),
  deleteCollection(poolCompetitionRef.collection('bets')),
  deleteCollection(poolCompetitionRef.collection('leaderboard')),
  deleteCollection(poolCompetitionRef.collection('podiumPredictions')),
]);

await poolRef.set({
  name: POOL_NAME,
  createdBy: adminUid,
  inviteCode: INVITE_CODE,
  members: FieldValue.arrayUnion(adminUid),
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  isSandbox: true,
  isPublic: true,
}, { merge: true });

await poolCompetitionRef.collection('leaderboard').doc(adminUid).set({
  nickname: adminNickname,
  matchPoints: 0,
  bonusPoints: 0,
  totalPoints: 0,
  exactResultsCount: 0,
  correctOutcomeCount: 0,
}, { merge: true });

await db.collection('users').doc(adminUid).set({
  pools: FieldValue.arrayUnion(POOL_ID),
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

await competitionRef.set({
  name: 'Sandbox Ranking Multi-fase',
  apiProvider: 'manual',
  apiCode: null,
  season: 2026,
  enabled: true,
  syncEnabled: false,
  isTest: true,
  podiumPredictionEnabled: false,
  sandboxPhase: 'groups',
  sandboxLastAdvancedFrom: FieldValue.delete(),
  sandboxStandings: FieldValue.delete(),
  sandboxPoolId: POOL_ID,
  sandboxInviteCode: INVITE_CODE,
  bettingWindowHours: BETTING_WINDOW_HOURS,
  teams,
  lastSyncAt: FieldValue.serverTimestamp(),
  lastSyncStatus: 'success',
  lastSyncMatchCount: groupFixtures.length,
  sortOrder: 1,
}, { merge: true });

const startsAt = kickoffBase();
const batch = db.batch();
groupFixtures.forEach(([id, home, away, groupLabel], index) => {
  const kickoffAt = new Date(startsAt.getTime() + index * 5 * 60 * 1000);
  batch.set(competitionRef.collection('matches').doc(id), matchDoc({
    id,
    home,
    away,
    kickoffAt,
    matchday: index + 1,
    groupLabel,
    stage: 'GROUP_STAGE',
  }));
});
await batch.commit();

console.log(`Sandbox multi-phase ready: competition=${COMPETITION_ID}; pool=${POOL_NAME} (${POOL_ID}); inviteCode=${INVITE_CODE}; phase=groups; matches=${groupFixtures.length}; firstKickoff=${startsAt.toISOString()}`);
