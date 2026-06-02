import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { calculateMatchPoints } from './scoring.mjs';

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const COMPETITION_ID = 'ranking-sandbox';
const POOL_ID = 'ranking-sandbox-pool';
const BETTING_WINDOW_HOURS = 12;

const PHASE_ORDER = ['groups', 'quarterfinals', 'semifinals', 'finals', 'complete'];

const phaseResults = {
  groups: {
    'g-01': [2, 0],
    'g-02': [1, 1],
    'g-03': [1, 2],
    'g-04': [0, 3],
    'g-05': [2, 2],
    'g-06': [1, 0],
    'g-07': [3, 1],
    'g-08': [2, 1],
    'g-09': [2, 1],
    'g-10': [0, 2],
    'g-11': [1, 1],
    'g-12': [2, 0],
    'g-13': [1, 2],
    'g-14': [2, 0],
    'g-15': [2, 2],
    'g-16': [1, 1],
  },
  quarterfinals: {
    'qf-01': [2, 1],
    'qf-02': [1, 3],
    'qf-03': [2, 0],
    'qf-04': [1, 2],
  },
  semifinals: {
    'sf-01': [2, 0],
    'sf-02': [1, 2],
  },
  finals: {
    'third-01': [2, 1],
    'final-01': [1, 2],
  },
};

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

function kickoffBase() {
  const startsAt = new Date(Date.now() + BETTING_WINDOW_HOURS * 60 * 60 * 1000);
  startsAt.setSeconds(0, 0);
  return startsAt;
}

function winnerFor(home, away, scoreHome, scoreAway) {
  if (scoreHome > scoreAway) return home;
  if (scoreAway > scoreHome) return away;
  return home;
}

function loserFor(home, away, scoreHome, scoreAway) {
  if (scoreHome > scoreAway) return away;
  if (scoreAway > scoreHome) return home;
  return away;
}

function blankStats(team, group) {
  return { team, group, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

function buildStandings(matches) {
  const standings = new Map();

  for (const match of matches) {
    const data = match.data();
    if (data.stage !== 'GROUP_STAGE' || data.scoreHome == null || data.scoreAway == null) continue;

    const group = data.group_label;
    const homeKey = `${group}:${data.home}`;
    const awayKey = `${group}:${data.away}`;
    if (!standings.has(homeKey)) standings.set(homeKey, blankStats(data.home, group));
    if (!standings.has(awayKey)) standings.set(awayKey, blankStats(data.away, group));

    const home = standings.get(homeKey);
    const away = standings.get(awayKey);
    home.played += 1;
    away.played += 1;
    home.gf += data.scoreHome;
    home.ga += data.scoreAway;
    away.gf += data.scoreAway;
    away.ga += data.scoreHome;

    if (data.scoreHome > data.scoreAway) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (data.scoreAway > data.scoreHome) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const byGroup = {};
  for (const stat of standings.values()) {
    stat.gd = stat.gf - stat.ga;
    if (!byGroup[stat.group]) byGroup[stat.group] = [];
    byGroup[stat.group].push(stat);
  }

  for (const group of Object.keys(byGroup)) {
    byGroup[group].sort((a, b) =>
      b.points - a.points
      || b.gd - a.gd
      || b.gf - a.gf
      || a.team.localeCompare(b.team)
    );
  }

  return byGroup;
}

function nextMatchDoc({ id, home, away, kickoffAt, stage, label, matchday }) {
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
    group_label: '',
    matchday,
    stage,
    label,
    status: 'upcoming',
    apiStatus: 'SCHEDULED',
    scoreHome: null,
    scoreAway: null,
    winner: null,
    isPlayable: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function createQuarterfinals(standings, startsAt) {
  const a = standings.A || [];
  const b = standings.B || [];
  const c = standings.C || [];
  const d = standings.D || [];
  return [
    ['qf-01', a[0]?.team, b[1]?.team, 'Quartas 1'],
    ['qf-02', b[0]?.team, a[1]?.team, 'Quartas 2'],
    ['qf-03', c[0]?.team, d[1]?.team, 'Quartas 3'],
    ['qf-04', d[0]?.team, c[1]?.team, 'Quartas 4'],
  ].map(([id, home, away, label], index) => nextMatchDoc({
    id,
    home,
    away,
    label,
    stage: 'QUARTER_FINALS',
    matchday: 17 + index,
    kickoffAt: new Date(startsAt.getTime() + index * 5 * 60 * 1000),
  }));
}

function createSemifinals(matchMap, startsAt) {
  return [
    ['sf-01', winnerForMatch(matchMap['qf-01']), winnerForMatch(matchMap['qf-02']), 'Semi-Final 1'],
    ['sf-02', winnerForMatch(matchMap['qf-03']), winnerForMatch(matchMap['qf-04']), 'Semi-Final 2'],
  ].map(([id, home, away, label], index) => nextMatchDoc({
    id,
    home,
    away,
    label,
    stage: 'SEMI_FINALS',
    matchday: 21 + index,
    kickoffAt: new Date(startsAt.getTime() + index * 5 * 60 * 1000),
  }));
}

function createFinals(matchMap, startsAt) {
  return [
    ['third-01', loserForMatch(matchMap['sf-01']), loserForMatch(matchMap['sf-02']), '3º Lugar'],
    ['final-01', winnerForMatch(matchMap['sf-01']), winnerForMatch(matchMap['sf-02']), 'Final'],
  ].map(([id, home, away, label], index) => nextMatchDoc({
    id,
    home,
    away,
    label,
    stage: 'FINALS',
    matchday: 23 + index,
    kickoffAt: new Date(startsAt.getTime() + index * 5 * 60 * 1000),
  }));
}

function winnerForMatch(match) {
  return winnerFor(match.home, match.away, match.scoreHome, match.scoreAway);
}

function loserForMatch(match) {
  return loserFor(match.home, match.away, match.scoreHome, match.scoreAway);
}

async function scorePhase(phase, matchesSnapshot) {
  const results = phaseResults[phase];
  if (!results) return { scoredMatches: 0, matchMap: {} };

  const matchBatch = db.batch();
  const matchMap = {};
  let scoredMatches = 0;

  for (const [matchId, [scoreHome, scoreAway]] of Object.entries(results)) {
    const matchDoc = matchesSnapshot.docs.find((doc) => doc.id === matchId);
    if (!matchDoc) throw new Error(`Missing match ${matchId} for phase ${phase}.`);
    const data = matchDoc.data();
    const winner = winnerFor(data.home, data.away, scoreHome, scoreAway);
    matchMap[matchId] = { ...data, id: matchId, scoreHome, scoreAway, winner };
    matchBatch.set(matchDoc.ref, {
      status: 'finished',
      apiStatus: 'FINISHED',
      scoreHome,
      scoreAway,
      winner,
      isPlayable: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    scoredMatches += 1;
  }

  await matchBatch.commit();
  return { scoredMatches, matchMap };
}

async function recalculateLeaderboard() {
  const [matchesSnapshot, betsSnapshot] = await Promise.all([
    competitionRef.collection('matches').get(),
    poolCompetitionRef.collection('bets').get(),
  ]);

  const resultsByMatch = new Map();
  matchesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.scoreHome != null && data.scoreAway != null) {
      resultsByMatch.set(doc.id, data);
    }
  });

  const userTotals = new Map();
  let batch = db.batch();
  let batchCount = 0;
  let scoredBets = 0;

  for (const betDoc of betsSnapshot.docs) {
    const bet = betDoc.data();
    const match = resultsByMatch.get(bet.matchId);
    if (!match) continue;

    const result = calculateMatchPoints(
      bet.predictedScoreA,
      bet.predictedScoreB,
      match.scoreHome,
      match.scoreAway
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
      scoredScoreHome: match.scoreHome,
      scoredScoreAway: match.scoreAway,
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

  const leaderboardSnapshot = await poolCompetitionRef.collection('leaderboard').get();
  const knownUsers = new Set([
    ...leaderboardSnapshot.docs.map((doc) => doc.id),
    ...userTotals.keys(),
  ]);

  for (const uid of knownUsers) {
    const leaderboard = poolCompetitionRef.collection('leaderboard').doc(uid);
    const current = (await leaderboard.get()).data() || {};
    const totals = userTotals.get(uid) || { matchPoints: 0, exact: 0, outcome: 0 };
    await leaderboard.set({
      nickname: current.nickname || '',
      matchPoints: totals.matchPoints,
      bonusPoints: current.bonusPoints || 0,
      totalPoints: totals.matchPoints + (current.bonusPoints || 0),
      exactResultsCount: totals.exact,
      correctOutcomeCount: totals.outcome,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return scoredBets;
}

async function createNextPhase(currentPhase, matchesSnapshot, currentMatchMap) {
  const startsAt = kickoffBase();
  let nextPhase = 'complete';
  let nextMatches = [];
  let standings = null;

  if (currentPhase === 'groups') {
    const latestMatches = await competitionRef.collection('matches').get();
    standings = buildStandings(latestMatches.docs);
    nextMatches = createQuarterfinals(standings, startsAt);
    nextPhase = 'quarterfinals';
  } else if (currentPhase === 'quarterfinals') {
    nextMatches = createSemifinals(currentMatchMap, startsAt);
    nextPhase = 'semifinals';
  } else if (currentPhase === 'semifinals') {
    nextMatches = createFinals(currentMatchMap, startsAt);
    nextPhase = 'finals';
  } else if (currentPhase === 'finals') {
    nextPhase = 'complete';
  }

  if (nextMatches.some((match) => !match.home || !match.away)) {
    throw new Error(`Could not define all matches for next phase after ${currentPhase}.`);
  }

  if (nextMatches.length > 0) {
    const batch = db.batch();
    nextMatches.forEach((match) => {
      batch.set(competitionRef.collection('matches').doc(match.apiMatchId.replace('sandbox-', '')), match);
    });
    await batch.commit();
  }

  await competitionRef.set({
    sandboxPhase: nextPhase,
    sandboxLastAdvancedFrom: currentPhase,
    sandboxStandings: standings,
    lastSyncAt: FieldValue.serverTimestamp(),
    lastSyncStatus: 'success',
    lastSyncMatchCount: matchesSnapshot.size + nextMatches.length,
  }, { merge: true });

  return { nextPhase, nextMatches };
}

const competitionSnap = await competitionRef.get();
if (!competitionSnap.exists) throw new Error('Sandbox competition not found. Run setup-ranking-sandbox first.');

const competition = competitionSnap.data();
const currentPhase = competition.sandboxPhase || 'groups';
if (!PHASE_ORDER.includes(currentPhase)) throw new Error(`Unknown sandbox phase: ${currentPhase}`);
if (currentPhase === 'complete') {
  console.log(`Sandbox already complete for ${POOL_ID}.`);
  process.exit(0);
}

const matchesSnapshot = await competitionRef.collection('matches').get();
const { scoredMatches, matchMap } = await scorePhase(currentPhase, matchesSnapshot);
const scoredBets = await recalculateLeaderboard();
const { nextPhase, nextMatches } = await createNextPhase(currentPhase, matchesSnapshot, matchMap);

console.log(`Sandbox advanced: phase=${currentPhase}; scoredMatches=${scoredMatches}; scoredBets=${scoredBets}; nextPhase=${nextPhase}; nextMatches=${nextMatches.length}; pool=${POOL_ID}.`);
