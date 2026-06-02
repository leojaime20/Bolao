import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const adminUid = process.env.ADMIN_UID || process.env.VITE_ADMIN_UID;

const COMPETITION_ID = 'ranking-sandbox';
const POOL_ID = 'ranking-sandbox-pool';
const POOL_NAME = 'Teste Ranking';
const INVITE_CODE = 'RANKTEST';

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

function matchDoc(id, home, away, kickoffAt, matchday) {
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
    group_label: 'Teste',
    matchday,
    stage: 'SANDBOX',
    status: 'upcoming',
    apiStatus: 'SCHEDULED',
    scoreHome: null,
    scoreAway: null,
    winner: null,
    isPlayable: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

const startsAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
startsAt.setSeconds(0, 0);

const fixtures = [
  ['Brasil Teste', 'China Teste'],
  ['Portugal Teste', 'Argentina Teste'],
  ['Franca Teste', 'Espanha Teste'],
  ['Inglaterra Teste', 'Italia Teste'],
  ['Alemanha Teste', 'Holanda Teste'],
  ['Japao Teste', 'Coreia Teste'],
  ['Mexico Teste', 'Uruguai Teste'],
  ['Colombia Teste', 'Chile Teste'],
  ['Marrocos Teste', 'Senegal Teste'],
  ['Canada Teste', 'EUA Teste'],
];

const userSnap = await db.collection('users').doc(adminUid).get();
const adminNickname = userSnap.exists ? userSnap.data().nickname || '' : '';

const poolRef = db.collection('pools').doc(POOL_ID);
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

await poolRef.collection('leaderboard').doc(adminUid).set({
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

const competitionRef = db.collection('competitions').doc(COMPETITION_ID);
await competitionRef.set({
  name: 'Sandbox Ranking',
  apiProvider: 'manual',
  apiCode: null,
  season: 2026,
  enabled: true,
  syncEnabled: false,
  isTest: true,
  podiumPredictionEnabled: false,
  lastSyncAt: FieldValue.serverTimestamp(),
  lastSyncStatus: 'success',
  lastSyncMatchCount: fixtures.length,
  sandboxPoolId: POOL_ID,
  sandboxInviteCode: INVITE_CODE,
  bettingWindowHours: 12,
  sortOrder: 1,
}, { merge: true });

const batch = db.batch();
fixtures.forEach(([home, away], index) => {
  const kickoffAt = new Date(startsAt.getTime() + index * 5 * 60 * 1000);
  const id = `sandbox-${String(index + 1).padStart(2, '0')}`;
  batch.set(competitionRef.collection('matches').doc(id), matchDoc(id, home, away, kickoffAt, index + 1), { merge: true });
});
await batch.commit();

console.log(`Sandbox ready: competition=${COMPETITION_ID}; pool=${POOL_NAME} (${POOL_ID}); inviteCode=${INVITE_CODE}; firstKickoff=${startsAt.toISOString()}`);
