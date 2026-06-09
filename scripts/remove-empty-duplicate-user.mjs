import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const requestedNickname = process.argv[2]?.trim();
const confirmation = process.argv[3] || '';
const shouldDelete = confirmation === 'REMOVE_EMPTY';

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
if (!requestedNickname) throw new Error('Provide the duplicate nickname.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const auth = getAuth();

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('pt-BR');
}

async function inspectUser(uid, userData, pools) {
  const locations = [];
  let bets = 0;
  let podiumPredictions = 0;
  let poolMemberships = 0;
  let leaderboardEntries = 0;

  for (const poolDoc of pools) {
    const root = poolDoc.ref;
    if ((poolDoc.data().members || []).includes(uid)) poolMemberships += 1;
    if ((await root.collection('leaderboard').doc(uid).get()).exists) leaderboardEntries += 1;

    const legacyBets = await root.collection('bets').where('userId', '==', uid).get();
    bets += legacyBets.size;

    const competitions = await root.collection('competitions').get();
    for (const competitionDoc of competitions.docs) {
      const competitionRoot = competitionDoc.ref;
      const [competitionBets, podium, leaderboard] = await Promise.all([
        competitionRoot.collection('bets').where('userId', '==', uid).get(),
        competitionRoot.collection('podiumPredictions').where('userId', '==', uid).get(),
        competitionRoot.collection('leaderboard').doc(uid).get(),
      ]);
      bets += competitionBets.size;
      podiumPredictions += podium.size;
      if (leaderboard.exists) leaderboardEntries += 1;

      if (competitionBets.size || podium.size) {
        locations.push({
          poolId: poolDoc.id,
          competitionId: competitionDoc.id,
          bets: competitionBets.size,
          podiumPredictions: podium.size,
        });
      }
    }
  }

  let authUser = null;
  try {
    authUser = await auth.getUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  return {
    uid,
    nickname: userData.nickname || '',
    email: userData.email || '',
    createdAt: userData.createdAt?.toDate?.().toISOString() || null,
    lastLoginAt: userData.lastLoginAt?.toDate?.().toISOString() || null,
    loginCount: userData.loginCount || 0,
    authCreatedAt: authUser?.metadata.creationTime || null,
    authLastSignInAt: authUser?.metadata.lastSignInTime || null,
    authProviders: authUser?.providerData.map((provider) => provider.providerId) || [],
    poolMemberships,
    leaderboardEntries,
    bets,
    podiumPredictions,
    hasPredictionData: bets > 0 || podiumPredictions > 0,
    locations,
  };
}

async function removeEmptyUser(candidate, pools) {
  const batch = db.batch();
  batch.delete(db.collection('users').doc(candidate.uid));

  for (const poolDoc of pools) {
    batch.set(poolDoc.ref, { members: FieldValue.arrayRemove(candidate.uid) }, { merge: true });
    batch.delete(poolDoc.ref.collection('leaderboard').doc(candidate.uid));

    const competitions = await poolDoc.ref.collection('competitions').get();
    for (const competitionDoc of competitions.docs) {
      batch.delete(competitionDoc.ref.collection('leaderboard').doc(candidate.uid));
    }
  }

  await batch.commit();

  try {
    await auth.deleteUser(candidate.uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
}

const normalizedRequestedName = normalizeName(requestedNickname);
const [usersSnapshot, poolsSnapshot] = await Promise.all([
  db.collection('users').get(),
  db.collection('pools').get(),
]);
const matchingUsers = usersSnapshot.docs.filter(
  (userDoc) => normalizeName(userDoc.data().nickname) === normalizedRequestedName
);

if (matchingUsers.length !== 2) {
  throw new Error(
    `Expected exactly 2 users named "${requestedNickname}", found ${matchingUsers.length}. Nothing changed.`
  );
}

const inspected = [];
for (const userDoc of matchingUsers) {
  inspected.push(await inspectUser(userDoc.id, userDoc.data(), poolsSnapshot.docs));
}

console.log(JSON.stringify({ mode: shouldDelete ? 'delete' : 'dry-run', users: inspected }, null, 2));

const emptyUsers = inspected.filter((user) => !user.hasPredictionData);
const usersWithData = inspected.filter((user) => user.hasPredictionData);

if (emptyUsers.length !== 1 || usersWithData.length !== 1) {
  throw new Error(
    `Safety check failed: expected one empty user and one user with predictions. Nothing changed.`
  );
}

if (!shouldDelete) {
  console.log(`Dry run complete. Empty UID: ${emptyUsers[0].uid}. No data changed.`);
  process.exit(0);
}

await removeEmptyUser(emptyUsers[0], poolsSnapshot.docs);
console.log(`Removed empty duplicate UID ${emptyUsers[0].uid}. Preserved UID ${usersWithData[0].uid}.`);
