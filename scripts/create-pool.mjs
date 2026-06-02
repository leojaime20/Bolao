import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const adminUid = process.env.ADMIN_UID || process.env.VITE_ADMIN_UID;
const poolName = process.argv[2] || 'Bolao PB CHINA';
const inviteCode = (process.argv[3] || 'PBCHINA').trim().toUpperCase();
const poolId = (process.argv[4] || poolName)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
if (!adminUid) throw new Error('Missing ADMIN_UID/VITE_ADMIN_UID secret.');
if (!poolName.trim()) throw new Error('Pool name is required.');
if (!inviteCode) throw new Error('Invite code is required.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const poolRef = db.collection('pools').doc(poolId);
const userRef = db.collection('users').doc(adminUid);
const leaderboardRef = poolRef.collection('leaderboard').doc(adminUid);

await db.runTransaction(async (transaction) => {
  const matchingInvite = await db.collection('pools').where('inviteCode', '==', inviteCode).limit(1).get();
  if (!matchingInvite.empty && matchingInvite.docs[0].id !== poolId) {
    throw new Error(`Invite code ${inviteCode} is already used by pool ${matchingInvite.docs[0].id}.`);
  }

  const userSnap = await transaction.get(userRef);
  const nickname = userSnap.exists ? userSnap.data().nickname || '' : '';

  transaction.set(poolRef, {
    name: poolName.trim(),
    createdBy: adminUid,
    inviteCode,
    members: FieldValue.arrayUnion(adminUid),
    isPublic: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  transaction.set(leaderboardRef, {
    nickname,
    matchPoints: 0,
    bonusPoints: 0,
    totalPoints: 0,
    exactResultsCount: 0,
    correctOutcomeCount: 0,
  }, { merge: true });

  transaction.set(userRef, {
    pools: FieldValue.arrayUnion(poolId),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});

console.log(`Pool ready: ${poolName.trim()} (${poolId}) inviteCode=${inviteCode}`);
