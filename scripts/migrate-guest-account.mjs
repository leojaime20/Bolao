import { writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const sourceUid = process.argv[2]?.trim();
const targetEmail = process.argv[3]?.trim().toLowerCase();
const confirmation = process.argv[4] || '';
const shouldMigrate = confirmation === 'MIGRATE_GUEST';

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
if (!sourceUid) throw new Error('Provide the guest UID.');
if (!targetEmail) throw new Error('Provide the target email.');

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const auth = getAuth();

function serialize(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item?.toDate instanceof Function) return item.toDate().toISOString();
    return item;
  }));
}

async function inspectUser(uid, pools, competitionIds) {
  const authUser = await auth.getUser(uid);
  const userSnapshot = await db.collection('users').doc(uid).get();
  const records = [];

  for (const poolDoc of pools) {
    const poolName = poolDoc.data().name || poolDoc.id;
    const legacyBets = await poolDoc.ref.collection('bets').where('userId', '==', uid).get();
    for (const betDoc of legacyBets.docs) {
      records.push({
        type: 'legacyBet',
        poolId: poolDoc.id,
        poolName,
        path: betDoc.ref.path,
        matchId: betDoc.data().matchId,
        data: betDoc.data(),
      });
    }

    const legacyLeaderboard = await poolDoc.ref.collection('leaderboard').doc(uid).get();
    if (legacyLeaderboard.exists) {
      records.push({
        type: 'legacyLeaderboard',
        poolId: poolDoc.id,
        poolName,
        path: legacyLeaderboard.ref.path,
        data: legacyLeaderboard.data(),
      });
    }

    for (const competitionId of competitionIds) {
      const root = poolDoc.ref.collection('competitions').doc(competitionId);
      const [bets, podium, leaderboard] = await Promise.all([
        root.collection('bets').where('userId', '==', uid).get(),
        root.collection('podiumPredictions').doc(uid).get(),
        root.collection('leaderboard').doc(uid).get(),
      ]);

      for (const betDoc of bets.docs) {
        records.push({
          type: 'bet',
          poolId: poolDoc.id,
          poolName,
          competitionId,
          path: betDoc.ref.path,
          matchId: betDoc.data().matchId,
          data: betDoc.data(),
        });
      }
      if (podium.exists) {
        records.push({
          type: 'podium',
          poolId: poolDoc.id,
          poolName,
          competitionId,
          path: podium.ref.path,
          data: podium.data(),
        });
      }
      if (leaderboard.exists) {
        records.push({
          type: 'leaderboard',
          poolId: poolDoc.id,
          poolName,
          competitionId,
          path: leaderboard.ref.path,
          data: leaderboard.data(),
        });
      }
    }
  }

  return {
    uid,
    email: authUser.email || '',
    providers: authUser.providerData.map((provider) => provider.providerId),
    userData: userSnapshot.exists ? userSnapshot.data() : null,
    records,
  };
}

const targetAuthUser = await auth.getUserByEmail(targetEmail);
const targetUid = targetAuthUser.uid;
if (targetUid === sourceUid) {
  throw new Error('The email is already linked to the guest UID. No migration is needed.');
}

const [poolsSnapshot, competitionsSnapshot] = await Promise.all([
  db.collection('pools').get(),
  db.collection('competitions').get(),
]);
const competitionIds = competitionsSnapshot.docs.map((doc) => doc.id);
const [source, target] = await Promise.all([
  inspectUser(sourceUid, poolsSnapshot.docs, competitionIds),
  inspectUser(targetUid, poolsSnapshot.docs, competitionIds),
]);

const sourcePredictions = source.records.filter(
  (record) => record.type === 'bet' || record.type === 'legacyBet' || record.type === 'podium'
);
const targetPredictions = target.records.filter(
  (record) => record.type === 'bet' || record.type === 'legacyBet' || record.type === 'podium'
);

const backup = serialize({
  exportedAt: new Date().toISOString(),
  mode: shouldMigrate ? 'migration' : 'dry-run',
  source,
  target,
});
writeFileSync('guest-migration-backup.json', JSON.stringify(backup, null, 2));

console.log(JSON.stringify({
  mode: shouldMigrate ? 'migration' : 'dry-run',
  source: {
    uid: source.uid,
    nickname: source.userData?.nickname || '',
    providers: source.providers,
    gameBets: sourcePredictions.filter(
      (record) => record.type === 'bet' || record.type === 'legacyBet'
    ).length,
    podiumPredictions: sourcePredictions.filter((record) => record.type === 'podium').length,
  },
  target: {
    uid: target.uid,
    email: target.email,
    nickname: target.userData?.nickname || '',
    providers: target.providers,
    predictionRecords: targetPredictions.length,
  },
}, null, 2));

if (source.providers.length !== 0) {
  throw new Error('Source UID is not an anonymous guest. Nothing changed.');
}
if (sourcePredictions.length === 0) {
  throw new Error('Source guest has no predictions. Nothing changed.');
}
if (targetPredictions.length !== 0) {
  throw new Error('Target account already has predictions. Manual conflict review is required.');
}
if (!shouldMigrate) {
  console.log('Dry run complete. Backup artifact created. No data changed.');
  process.exit(0);
}

const batch = db.batch();

for (const record of source.records) {
  const sourceRef = db.doc(record.path);
  let targetRef;

  if (record.type === 'legacyBet') {
    targetRef = db.collection('pools').doc(record.poolId)
      .collection('bets').doc(`${targetUid}_${record.matchId}`);
    batch.set(targetRef, { ...record.data, userId: targetUid });
  } else if (record.type === 'legacyLeaderboard') {
    targetRef = db.collection('pools').doc(record.poolId)
      .collection('leaderboard').doc(targetUid);
    batch.set(targetRef, record.data, { merge: true });
  } else {
    const competitionRoot = db.collection('pools').doc(record.poolId)
      .collection('competitions').doc(record.competitionId);
    if (record.type === 'bet') {
      targetRef = competitionRoot.collection('bets').doc(`${targetUid}_${record.matchId}`);
      batch.set(targetRef, { ...record.data, userId: targetUid });
    } else if (record.type === 'podium') {
      targetRef = competitionRoot.collection('podiumPredictions').doc(targetUid);
      batch.set(targetRef, { ...record.data, userId: targetUid });
    } else if (record.type === 'leaderboard') {
      targetRef = competitionRoot.collection('leaderboard').doc(targetUid);
      batch.set(targetRef, record.data, { merge: true });
    }
  }

  batch.delete(sourceRef);
}

const affectedPoolIds = new Set([
  ...(source.userData?.pools || []),
  ...source.records.map((record) => record.poolId),
  ...poolsSnapshot.docs
    .filter((poolDoc) => (poolDoc.data().members || []).includes(sourceUid))
    .map((poolDoc) => poolDoc.id),
]);

for (const poolDoc of poolsSnapshot.docs.filter((doc) => affectedPoolIds.has(doc.id))) {
  const members = (poolDoc.data().members || []).filter((uid) => uid !== sourceUid);
  if (!members.includes(targetUid)) members.push(targetUid);
  batch.set(poolDoc.ref, { members }, { merge: true });
}

const sourcePools = source.userData?.pools || [];
const targetPools = target.userData?.pools || [];
batch.set(db.collection('users').doc(targetUid), {
  nickname: source.userData?.nickname || target.userData?.nickname || '',
  email: targetEmail,
  pools: [...new Set([...targetPools, ...sourcePools])],
  migratedFromUid: sourceUid,
  migratedAt: FieldValue.serverTimestamp(),
}, { merge: true });
batch.delete(db.collection('users').doc(sourceUid));
batch.set(db.collection('adminMigrations').doc(), {
  type: 'guest-account',
  sourceUid,
  targetUid,
  targetEmail,
  predictionRecords: sourcePredictions.length,
  createdAt: FieldValue.serverTimestamp(),
});

await batch.commit();
await auth.deleteUser(sourceUid);

console.log(`Migration complete: ${sourceUid} -> ${targetUid} (${targetEmail}).`);
