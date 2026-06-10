import { writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const targetUid = process.argv[2]?.trim();
const sourceUids = (process.argv[3] || '').split(',').map((uid) => uid.trim()).filter(Boolean);
const confirmation = process.argv[4] || '';
const shouldMerge = confirmation === 'MERGE_DUPLICATES';

if (!serviceAccountValue) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
if (!targetUid) throw new Error('Provide the target UID.');
if (sourceUids.length === 0) throw new Error('Provide at least one source UID.');
if (sourceUids.includes(targetUid)) throw new Error('Target UID cannot also be a source UID.');

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
    .toUpperCase();
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item?.toDate instanceof Function) return item.toDate().toISOString();
    return item;
  }));
}

function predictionKey(record) {
  return `${record.poolId}:${record.competitionId || 'legacy'}:${record.matchId}`;
}

async function inspectUser(uid, pools, competitionIds) {
  let authUser = null;
  try {
    authUser = await auth.getUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  const userSnapshot = await db.collection('users').doc(uid).get();
  const records = [];

  for (const poolDoc of pools) {
    const poolName = poolDoc.data().name || poolDoc.id;
    const legacyRoot = poolDoc.ref;
    const [legacyBets, legacyLeaderboard] = await Promise.all([
      legacyRoot.collection('bets').where('userId', '==', uid).get(),
      legacyRoot.collection('leaderboard').doc(uid).get(),
    ]);

    for (const betDoc of legacyBets.docs) {
      records.push({
        type: 'bet',
        poolId: poolDoc.id,
        poolName,
        competitionId: null,
        matchId: betDoc.data().matchId,
        path: betDoc.ref.path,
        data: betDoc.data(),
      });
    }
    if (legacyLeaderboard.exists) {
      records.push({
        type: 'leaderboard',
        poolId: poolDoc.id,
        poolName,
        competitionId: null,
        path: legacyLeaderboard.ref.path,
        data: legacyLeaderboard.data(),
      });
    }

    const poolCompetitions = await poolDoc.ref.collection('competitions').get();
    const poolCompetitionIds = new Set([
      ...competitionIds,
      ...poolCompetitions.docs.map((doc) => doc.id),
    ]);

    for (const competitionId of poolCompetitionIds) {
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
          matchId: betDoc.data().matchId,
          path: betDoc.ref.path,
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
    email: authUser?.email || '',
    providers: authUser?.providerData.map((provider) => provider.providerId) || [],
    userData: userSnapshot.exists ? userSnapshot.data() : null,
    authExists: Boolean(authUser),
    records,
  };
}

function targetRecordRef(record) {
  const root = db.collection('pools').doc(record.poolId);
  if (!record.competitionId) {
    if (record.type === 'bet') return root.collection('bets').doc(`${targetUid}_${record.matchId}`);
    return root.collection('leaderboard').doc(targetUid);
  }

  const competitionRoot = root.collection('competitions').doc(record.competitionId);
  if (record.type === 'bet') {
    return competitionRoot.collection('bets').doc(`${targetUid}_${record.matchId}`);
  }
  if (record.type === 'podium') {
    return competitionRoot.collection('podiumPredictions').doc(targetUid);
  }
  return competitionRoot.collection('leaderboard').doc(targetUid);
}

const [poolsSnapshot, competitionsSnapshot] = await Promise.all([
  db.collection('pools').get(),
  db.collection('competitions').get(),
]);
const competitionIds = competitionsSnapshot.docs.map((doc) => doc.id);
const [target, ...sources] = await Promise.all([
  inspectUser(targetUid, poolsSnapshot.docs, competitionIds),
  ...sourceUids.map((uid) => inspectUser(uid, poolsSnapshot.docs, competitionIds)),
]);

if (!target.authExists || !target.providers.includes('google.com')) {
  throw new Error('Target UID must be an existing Google-authenticated account.');
}

const allNames = [
  target.userData?.nickname,
  ...target.records.filter((record) => record.type === 'leaderboard').map((record) => record.data.nickname),
  ...sources.flatMap((source) => [
    source.userData?.nickname,
    ...source.records
      .filter((record) => record.type === 'leaderboard')
      .map((record) => record.data.nickname),
  ]),
].filter(Boolean).map(normalizeName);

if (allNames.some((name) => name !== 'MARIOT')) {
  throw new Error('Safety check failed: not every discovered nickname is MARIOT.');
}
if (sources.some((source) => source.providers.includes('google.com'))) {
  throw new Error('Safety check failed: a source UID is also linked to Google.');
}

const targetBets = new Map(
  target.records.filter((record) => record.type === 'bet').map((record) => [predictionKey(record), record])
);
const sourceBets = sources.flatMap((source) =>
  source.records.filter((record) => record.type === 'bet').map((record) => ({ ...record, sourceUid: source.uid }))
);
const copiedBets = [];
const conflictingBets = [];
const selectedSourceBets = new Map();

for (const record of sourceBets) {
  const key = predictionKey(record);
  if (targetBets.has(key)) {
    conflictingBets.push({ key, sourceUid: record.sourceUid, kept: 'target' });
  } else if (!selectedSourceBets.has(key)) {
    selectedSourceBets.set(key, record);
    copiedBets.push({ key, sourceUid: record.sourceUid });
  } else {
    conflictingBets.push({
      key,
      sourceUid: record.sourceUid,
      kept: selectedSourceBets.get(key).sourceUid,
    });
  }
}

const targetPodiumKeys = new Set(
  target.records
    .filter((record) => record.type === 'podium')
    .map((record) => `${record.poolId}:${record.competitionId}`)
);
const sourcePodiums = sources.flatMap((source) =>
  source.records.filter((record) => record.type === 'podium').map((record) => ({ ...record, sourceUid: source.uid }))
);
const copiedPodiums = [];
const conflictingPodiums = [];
const selectedSourcePodiums = new Map();

for (const record of sourcePodiums) {
  const key = `${record.poolId}:${record.competitionId}`;
  if (targetPodiumKeys.has(key)) {
    conflictingPodiums.push({ key, sourceUid: record.sourceUid, kept: 'target' });
  } else if (!selectedSourcePodiums.has(key)) {
    selectedSourcePodiums.set(key, record);
    copiedPodiums.push({ key, sourceUid: record.sourceUid });
  } else {
    conflictingPodiums.push({
      key,
      sourceUid: record.sourceUid,
      kept: selectedSourcePodiums.get(key).sourceUid,
    });
  }
}

const backup = serialize({
  exportedAt: new Date().toISOString(),
  mode: shouldMerge ? 'merge' : 'dry-run',
  target,
  sources,
  decisions: { copiedBets, conflictingBets, copiedPodiums, conflictingPodiums },
});
writeFileSync('duplicate-account-merge-backup.json', JSON.stringify(backup, null, 2));

console.log(JSON.stringify({
  mode: shouldMerge ? 'merge' : 'dry-run',
  target: {
    uid: target.uid,
    email: target.email,
    providers: target.providers,
    bets: targetBets.size,
    podiumPredictions: targetPodiumKeys.size,
  },
  sources: sources.map((source) => ({
    uid: source.uid,
    email: source.email,
    providers: source.providers,
    bets: source.records.filter((record) => record.type === 'bet').length,
    podiumPredictions: source.records.filter((record) => record.type === 'podium').length,
  })),
  decisions: { copiedBets, conflictingBets, copiedPodiums, conflictingPodiums },
}, null, 2));

if (!shouldMerge) {
  console.log('Dry run complete. Backup artifact created. No data changed.');
  process.exit(0);
}

const writer = db.bulkWriter();

for (const record of selectedSourceBets.values()) {
  writer.set(targetRecordRef(record), {
    ...record.data,
    userId: targetUid,
    migratedFromUid: record.sourceUid,
    migratedAt: FieldValue.serverTimestamp(),
  });
}
for (const record of selectedSourcePodiums.values()) {
  writer.set(targetRecordRef(record), {
    ...record.data,
    userId: targetUid,
    migratedFromUid: record.sourceUid,
    migratedAt: FieldValue.serverTimestamp(),
  });
}

for (const source of sources) {
  for (const record of source.records) {
    writer.delete(db.doc(record.path));
  }
  writer.delete(db.collection('users').doc(source.uid));
}

const affectedPoolIds = new Set([
  ...(target.userData?.pools || []),
  ...target.records.map((record) => record.poolId),
  ...sources.flatMap((source) => [
    ...(source.userData?.pools || []),
    ...source.records.map((record) => record.poolId),
  ]),
]);

for (const poolDoc of poolsSnapshot.docs.filter((doc) => affectedPoolIds.has(doc.id))) {
  const members = (poolDoc.data().members || []).filter((uid) => !sourceUids.includes(uid));
  if (!members.includes(targetUid)) members.push(targetUid);
  writer.set(poolDoc.ref, { members }, { merge: true });
}

writer.set(db.collection('users').doc(targetUid), {
  nickname: target.userData?.nickname || 'Mariot',
  email: target.email,
  pools: [...affectedPoolIds],
  mergedFromUids: FieldValue.arrayUnion(...sourceUids),
  mergedAt: FieldValue.serverTimestamp(),
}, { merge: true });

writer.set(db.collection('adminMigrations').doc(), {
  type: 'duplicate-account-merge',
  targetUid,
  sourceUids,
  copiedBets: copiedBets.length,
  conflictingBets: conflictingBets.length,
  copiedPodiums: copiedPodiums.length,
  conflictingPodiums: conflictingPodiums.length,
  createdAt: FieldValue.serverTimestamp(),
});

await writer.close();

for (const source of sources) {
  if (source.authExists) await auth.deleteUser(source.uid);
}

console.log(`Merge complete: ${sourceUids.join(', ')} -> ${targetUid}.`);
