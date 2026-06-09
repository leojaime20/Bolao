import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const auth = getAuth();

const users = new Map();

function userSummary(uid) {
  if (!users.has(uid)) {
    users.set(uid, {
      uid,
      nickname: '',
      gameBets: 0,
      podiumPredictions: 0,
      pools: new Set(),
      competitions: new Set(),
    });
  }
  return users.get(uid);
}

const [usersSnapshot, poolsSnapshot] = await Promise.all([
  db.collection('users').get(),
  db.collection('pools').get(),
]);

for (const userDoc of usersSnapshot.docs) {
  userSummary(userDoc.id).nickname = userDoc.data().nickname || '';
}

for (const poolDoc of poolsSnapshot.docs) {
  const legacyBets = await poolDoc.ref.collection('bets').get();
  for (const betDoc of legacyBets.docs) {
    const bet = betDoc.data();
    if (!bet.userId) continue;
    const summary = userSummary(bet.userId);
    summary.gameBets += 1;
    summary.pools.add(poolDoc.data().name || poolDoc.id);
  }

  const competitions = await poolDoc.ref.collection('competitions').get();
  for (const competitionDoc of competitions.docs) {
    const [bets, podium, leaderboard] = await Promise.all([
      competitionDoc.ref.collection('bets').get(),
      competitionDoc.ref.collection('podiumPredictions').get(),
      competitionDoc.ref.collection('leaderboard').get(),
    ]);

    for (const entry of leaderboard.docs) {
      const summary = userSummary(entry.id);
      if (!summary.nickname) summary.nickname = entry.data().nickname || '';
    }

    for (const betDoc of bets.docs) {
      const bet = betDoc.data();
      if (!bet.userId) continue;
      const summary = userSummary(bet.userId);
      summary.gameBets += 1;
      summary.pools.add(poolDoc.data().name || poolDoc.id);
      summary.competitions.add(competitionDoc.id);
    }

    for (const predictionDoc of podium.docs) {
      const prediction = predictionDoc.data();
      const uid = prediction.userId || predictionDoc.id;
      const summary = userSummary(uid);
      summary.podiumPredictions += 1;
      summary.pools.add(poolDoc.data().name || poolDoc.id);
      summary.competitions.add(competitionDoc.id);
    }
  }
}

const candidates = [...users.values()].filter(
  (user) => user.gameBets > 0 || user.podiumPredictions > 0
);
const authUsers = new Map();

for (let index = 0; index < candidates.length; index += 100) {
  const batch = candidates.slice(index, index + 100);
  const result = await auth.getUsers(batch.map((user) => ({ uid: user.uid })));
  for (const authUser of result.users) authUsers.set(authUser.uid, authUser);
}

const accounts = candidates
  .map((user) => {
    const authUser = authUsers.get(user.uid);
    const providers = authUser?.providerData.map((provider) => provider.providerId) || [];
    return {
      nickname: user.nickname || '(sem nome)',
      uid: user.uid,
      authStatus: !authUser
        ? 'missing'
        : providers.length === 0
          ? 'guest'
          : 'authenticated',
      providers,
      gameBets: user.gameBets,
      podiumPredictions: user.podiumPredictions,
      pools: [...user.pools].sort(),
      competitions: [...user.competitions].sort(),
      createdAt: authUser?.metadata.creationTime || null,
      lastSignInAt: authUser?.metadata.lastSignInTime || null,
    };
  })
  .sort((a, b) => a.nickname.localeCompare(b.nickname, 'pt-BR'));

const guests = accounts.filter((account) => account.authStatus === 'guest');

console.log(JSON.stringify({
  guestCount: guests.length,
  totalGameBets: guests.reduce((total, guest) => total + guest.gameBets, 0),
  totalPodiumPredictions: guests.reduce(
    (total, guest) => total + guest.podiumPredictions,
    0
  ),
  guests,
  accounts,
}, null, 2));
