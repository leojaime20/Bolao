const { initializeApp } = require('firebase-admin/app');
const { FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { calculateMatchPoints, calculatePodiumPoints } = require('./scoring');

initializeApp();

const db = getFirestore();
const FOOTBALL_DATA_API_KEY = defineSecret('FOOTBALL_DATA_API_KEY');
const ADMIN_UID = '1gcD31Rz0waqXKo7YoMYbr3VTQ03';
const API_BASE = 'https://api.football-data.org/v4';

function requireAdmin(request) {
  if (!request.auth || request.auth.uid !== ADMIN_UID) {
    throw new HttpsError('permission-denied', 'Somente o administrador pode executar esta acao.');
  }
}

function competitionRef(competitionId) {
  return db.collection('competitions').doc(competitionId);
}

function poolCompetitionRef(poolId, competitionId) {
  return db.collection('pools').doc(poolId).collection('competitions').doc(competitionId);
}

function mapApiStatus(status) {
  switch (status) {
    case 'FINISHED':
      return 'finished';
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    default:
      return 'upcoming';
  }
}

function normalizeApiMatch(match) {
  const fullTime = match.score && match.score.fullTime ? match.score.fullTime : {};
  const hasScore = fullTime.home != null && fullTime.away != null;
  const kickoffAt = Timestamp.fromDate(new Date(match.utcDate));
  return {
    apiMatchId: match.id,
    date: match.utcDate.slice(0, 10),
    utcDate: match.utcDate,
    kickoffAt,
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
    isPlayable: Boolean(match.homeTeam?.id && match.awayTeam?.id),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function fetchApiMatches(competition) {
  const token = FOOTBALL_DATA_API_KEY.value();
  if (!token) throw new Error('FOOTBALL_DATA_API_KEY nao configurado.');
  const params = new URLSearchParams();
  if (competition.season) params.set('season', String(competition.season));
  const response = await fetch(`${API_BASE}/competitions/${competition.apiCode}/matches?${params}`, {
    headers: { 'X-Auth-Token': token },
  });
  const requestsLeft = response.headers.get('x-requests-available-minute');
  const resetIn = response.headers.get('x-requestcounter-reset');
  logger.info('football-data request', {
    apiCode: competition.apiCode,
    status: response.status,
    requestsLeft,
    resetIn,
  });
  if (!response.ok) {
    throw new Error(`football-data ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }
  return response.json();
}

async function syncCompetitionMatches(competitionId) {
  const configSnap = await competitionRef(competitionId).get();
  if (!configSnap.exists) throw new Error(`Competicao ${competitionId} nao encontrada.`);
  const config = configSnap.data();
  if (!config.enabled || !config.apiCode) throw new Error(`Competicao ${competitionId} nao esta habilitada.`);

  const apiData = await fetchApiMatches(config);
  const matches = apiData.matches || [];
  const firstKickoff = matches.reduce((earliest, match) => {
    const kickoff = new Date(match.utcDate);
    return !earliest || kickoff < earliest ? kickoff : earliest;
  }, null);
  let batch = db.batch();
  let batchCount = 0;

  for (const apiMatch of matches) {
    const ref = competitionRef(competitionId).collection('matches').doc(String(apiMatch.id));
    batch.set(ref, normalizeApiMatch(apiMatch), { merge: true });
    batchCount += 1;
    if (batchCount === 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount) await batch.commit();

  const syncMetadata = {
    lastSyncAt: FieldValue.serverTimestamp(),
    lastSyncStatus: 'success',
    lastSyncMatchCount: matches.length,
    lastSyncError: FieldValue.delete(),
  };
  if (config.podiumPredictionEnabled != null
      && config.podiumPredictionFinalEnabled == null
      && firstKickoff) {
    syncMetadata.podiumPredictionDeadline = Timestamp.fromDate(firstKickoff);
  }
  await competitionRef(competitionId).set(syncMetadata, { merge: true });

  return matches.length;
}

async function freezePodiumConfiguration(competitionId, config) {
  if (!config.podiumPredictionDeadline || config.podiumPredictionFinalEnabled != null) {
    return config;
  }
  const deadline = config.podiumPredictionDeadline.toDate();
  if (new Date() < deadline) return config;
  const finalEnabled = Boolean(config.podiumPredictionEnabled);
  await competitionRef(competitionId).set({
    podiumPredictionLocked: true,
    podiumPredictionFinalEnabled: finalEnabled,
    podiumPredictionLockedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ...config, podiumPredictionLocked: true, podiumPredictionFinalEnabled: finalEnabled };
}

async function scoreCompetitionPools(competitionId) {
  let config = (await competitionRef(competitionId).get()).data() || {};
  config = await freezePodiumConfiguration(competitionId, config);

  const finishedSnap = await competitionRef(competitionId).collection('matches')
    .where('status', '==', 'finished')
    .get();
  const finished = new Map(finishedSnap.docs.map((doc) => [doc.id, doc.data()]));
  const poolsSnap = await db.collection('pools').get();
  let scoredBets = 0;
  let scoredPredictions = 0;

  for (const poolDoc of poolsSnap.docs) {
    const root = poolCompetitionRef(poolDoc.id, competitionId);
    const betsSnap = await root.collection('bets').get();
    const userTotals = new Map();
    let betBatch = db.batch();
    let pendingWrites = 0;

    for (const betDoc of betsSnap.docs) {
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
        betBatch.set(betDoc.ref, {
          pointsAwarded: result.points,
          scoreType: result.type,
          scoredAt: FieldValue.serverTimestamp(),
          scoredScoreHome: match.scoreHome,
          scoredScoreAway: match.scoreAway,
        }, { merge: true });
        pendingWrites += 1;
        scoredBets += 1;
        if (pendingWrites === 400) {
          await betBatch.commit();
          betBatch = db.batch();
          pendingWrites = 0;
        }
      }
    }
    if (pendingWrites) await betBatch.commit();

    const predictionsSnap = await root.collection('podiumPredictions').get();
    const canScorePodium = config.podiumPredictionFinalEnabled === true && config.officialPodium;
    for (const predictionDoc of predictionsSnap.docs) {
      const prediction = predictionDoc.data();
      const bonusPoints = canScorePodium
        ? calculatePodiumPoints(prediction, config.officialPodium)
        : 0;
      const totals = userTotals.get(predictionDoc.id) || { matchPoints: 0, exact: 0, outcome: 0 };
      totals.bonusPoints = bonusPoints;
      userTotals.set(predictionDoc.id, totals);
      if (prediction.bonusPoints !== bonusPoints && canScorePodium) {
        await predictionDoc.ref.set({
          bonusPoints,
          scoredAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        scoredPredictions += 1;
      }
    }

    for (const [uid, totals] of userTotals.entries()) {
      const leaderboardRef = root.collection('leaderboard').doc(uid);
      const leaderboardSnap = await leaderboardRef.get();
      const current = leaderboardSnap.exists ? leaderboardSnap.data() : {};
      const bonusPoints = totals.bonusPoints ?? current.bonusPoints ?? 0;
      await leaderboardRef.set({
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

async function syncAndScore(competitionId) {
  const importedMatches = await syncCompetitionMatches(competitionId);
  const scores = await scoreCompetitionPools(competitionId);
  return { importedMatches, ...scores };
}

exports.syncCompetitionNow = onCall(
  { secrets: [FOOTBALL_DATA_API_KEY], timeoutSeconds: 120 },
  async (request) => {
    requireAdmin(request);
    const competitionId = request.data?.competitionId;
    if (!competitionId || typeof competitionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Informe competitionId.');
    }
    try {
      return await syncAndScore(competitionId);
    } catch (error) {
      logger.error('syncCompetitionNow failed', { competitionId, error: error.message });
      await competitionRef(competitionId).set({
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      }, { merge: true });
      throw new HttpsError('internal', error.message);
    }
  }
);

exports.savePodiumPrediction = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faca login para salvar o palpite.');
  const { poolId, competitionId, champion, runnerUp, thirdPlace } = request.data || {};
  if (!poolId || !competitionId || !champion || !runnerUp || !thirdPlace) {
    throw new HttpsError('invalid-argument', 'Preencha as tres posicoes.');
  }
  if (new Set([champion, runnerUp, thirdPlace]).size !== 3) {
    throw new HttpsError('invalid-argument', 'Selecione tres equipes diferentes.');
  }
  const [configSnap, poolSnap] = await Promise.all([
    competitionRef(competitionId).get(),
    db.collection('pools').doc(poolId).get(),
  ]);
  if (!configSnap.exists || !poolSnap.exists) throw new HttpsError('not-found', 'Competicao ou pool nao encontrado.');
  const config = configSnap.data();
  const members = poolSnap.data().members || [];
  if (!members.includes(request.auth.uid)) throw new HttpsError('permission-denied', 'Usuario nao pertence ao pool.');
  const deadline = config.podiumPredictionDeadline?.toDate();
  if (!config.podiumPredictionEnabled || !deadline || new Date() >= deadline) {
    throw new HttpsError('failed-precondition', 'Palpite do podio encerrado ou desativado.');
  }
  await poolCompetitionRef(poolId, competitionId).collection('podiumPredictions').doc(request.auth.uid).set({
    userId: request.auth.uid,
    champion,
    runnerUp,
    thirdPlace,
    submittedAt: FieldValue.serverTimestamp(),
    bonusPoints: null,
  }, { merge: true });
  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  const leaderboardRef = poolCompetitionRef(poolId, competitionId).collection('leaderboard').doc(request.auth.uid);
  const leaderboardSnap = await leaderboardRef.get();
  if (!leaderboardSnap.exists) {
    await leaderboardRef.set({
      nickname: userSnap.exists ? userSnap.data().nickname || '' : '',
      matchPoints: 0,
      bonusPoints: 0,
      totalPoints: 0,
      exactResultsCount: 0,
      correctOutcomeCount: 0,
    });
  }
  return { saved: true };
});

exports.setOfficialPodium = onCall(async (request) => {
  requireAdmin(request);
  const { competitionId, champion, runnerUp, thirdPlace } = request.data || {};
  if (!competitionId
      || !champion || !runnerUp || !thirdPlace
      || new Set([champion, runnerUp, thirdPlace]).size !== 3) {
    throw new HttpsError('invalid-argument', 'Informe as tres equipes oficiais.');
  }
  await competitionRef(competitionId).set({
    officialPodium: { champion, runnerUp, thirdPlace },
    officialPodiumAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const result = await scoreCompetitionPools(competitionId);
  return { saved: true, ...result };
});

exports.syncEnabledCompetitionsScheduled = onSchedule(
  { schedule: 'every 30 minutes', secrets: [FOOTBALL_DATA_API_KEY], timeoutSeconds: 300 },
  async () => {
    const enabledSnap = await db.collection('competitions').where('syncEnabled', '==', true).get();
    for (const competition of enabledSnap.docs) {
      try {
        await syncAndScore(competition.id);
      } catch (error) {
        logger.error('Scheduled sync failed', { competitionId: competition.id, error: error.message });
        await competition.ref.set({
          lastSyncAt: FieldValue.serverTimestamp(),
          lastSyncStatus: 'error',
          lastSyncError: error.message,
        }, { merge: true });
      }
    }
  }
);
