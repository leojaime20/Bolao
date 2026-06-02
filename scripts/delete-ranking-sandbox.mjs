import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;

const COMPETITION_ID = 'ranking-sandbox';
const POOL_ID = 'ranking-sandbox-pool';

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');

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
  if (snapshot.empty) return 0;

  let deleted = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const entry of snapshot.docs) {
    batch.delete(entry.ref);
    deleted += 1;
    batchCount += 1;

    if (batchCount === 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount) await batch.commit();
  return deleted;
}

const poolRef = db.collection('pools').doc(POOL_ID);
const poolCompetitionRef = poolRef.collection('competitions').doc(COMPETITION_ID);
const competitionRef = db.collection('competitions').doc(COMPETITION_ID);

const deleted = {
  competitionMatches: await deleteCollection(competitionRef.collection('matches')),
  poolBets: await deleteCollection(poolRef.collection('bets')),
  poolLeaderboard: await deleteCollection(poolRef.collection('leaderboard')),
  poolCompetitionBets: await deleteCollection(poolCompetitionRef.collection('bets')),
  poolCompetitionLeaderboard: await deleteCollection(poolCompetitionRef.collection('leaderboard')),
  poolCompetitionPodium: await deleteCollection(poolCompetitionRef.collection('podiumPredictions')),
};

await poolCompetitionRef.delete();
await poolRef.delete();
await competitionRef.delete();

const usersSnapshot = await db.collection('users').where('pools', 'array-contains', POOL_ID).get();
for (const userDoc of usersSnapshot.docs) {
  await userDoc.ref.update({
    pools: FieldValue.arrayRemove(POOL_ID),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

console.log(`Ranking sandbox deleted: pool=${POOL_ID}; competition=${COMPETITION_ID}; usersUpdated=${usersSnapshot.size}; deleted=${JSON.stringify(deleted)}`);
