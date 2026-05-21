import { useState, useEffect, useCallback } from 'react';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';
import { usePools } from './usePools';
import { calculatePoints } from '../utils/scoring';
import { logError } from '../utils/logError';

function poolSubcollection(poolId, competitionId, name) {
  return competitionId
    ? collection(db, 'pools', poolId, 'competitions', competitionId, name)
    : collection(db, 'pools', poolId, name);
}

function poolSubdoc(poolId, competitionId, name, docId) {
  return competitionId
    ? doc(db, 'pools', poolId, 'competitions', competitionId, name, docId)
    : doc(db, 'pools', poolId, name, docId);
}

export function useBets(competitionId = null) {
  const { user, profile } = useAuth();
  const { activePoolId } = usePools();

  const saveBet = useCallback(
    async (matchId, predictedScoreA, predictedScoreB) => {
      if (!user || !activePoolId) {
        logError('NO_POOL', 'Tentativa de guardar aposta sem pool activo', {
          userId: user?.uid,
          matchId,
        });
        throw new Error('NO_POOL');
      }
      const docId = `${user.uid}_${matchId}`;
      const ref = poolSubdoc(activePoolId, competitionId, 'bets', docId);
      const existing = await getDoc(ref);

      const data = {
        userId: user.uid,
        matchId,
        predictedScoreA,
        predictedScoreB,
        updatedAt: serverTimestamp(),
      };

      if (!existing.exists()) {
        data.createdAt = serverTimestamp();
        data.pointsAwarded = null;
      }

      await setDoc(ref, data, { merge: true });

      const lbRef = poolSubdoc(activePoolId, competitionId, 'leaderboard', user.uid);
      const lbSnap = await getDoc(lbRef);
      if (!lbSnap.exists()) {
        await setDoc(lbRef, {
          nickname: profile?.nickname || '',
          totalPoints: 0,
          exactResultsCount: 0,
          correctOutcomeCount: 0,
        });
      } else if (profile?.nickname && lbSnap.data().nickname !== profile.nickname) {
        await setDoc(lbRef, { nickname: profile.nickname }, { merge: true });
      }

      // Analytics: track bet submission
      try {
        await addDoc(collection(db, 'analytics'), {
          type: 'bet',
          userId: user.uid,
          matchId,
          poolId: activePoolId,
          competitionId: competitionId || 'worldcup-2026',
          submittedAt: serverTimestamp(),
        });
      } catch {}
    },
    [user, profile, activePoolId, competitionId]
  );

  const getMyBets = useCallback(async () => {
    if (!user || !activePoolId) return [];
    const q = query(
      poolSubcollection(activePoolId, competitionId, 'bets'),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, [user, activePoolId, competitionId]);

  const getMatchBets = useCallback(
    async (matchId) => {
      if (!activePoolId) return [];
      const q = query(
        poolSubcollection(activePoolId, competitionId, 'bets'),
        where('matchId', '==', matchId)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    [activePoolId, competitionId]
  );

  const scoreMatch = useCallback(
    async (matchId, actualScoreA, actualScoreB) => {
      if (!activePoolId) return;
      const bets = await getMatchBets(matchId);
      const batch = writeBatch(db);
      const leaderboardUpdates = {};

      for (const bet of bets) {
        const result = calculatePoints(
          bet.predictedScoreA,
          bet.predictedScoreB,
          actualScoreA,
          actualScoreB
        );
        if (!result) continue;

        const betRef = poolSubdoc(activePoolId, competitionId, 'bets', bet.id);
        batch.update(betRef, { pointsAwarded: result.points });

        if (!leaderboardUpdates[bet.userId]) {
          leaderboardUpdates[bet.userId] = { points: 0, exact: 0, outcome: 0 };
        }
        leaderboardUpdates[bet.userId].points += result.points;
        if (result.type === 'exact') leaderboardUpdates[bet.userId].exact += 1;
        if (result.type === 'outcome') leaderboardUpdates[bet.userId].outcome += 1;
      }

      await batch.commit();

      for (const [uid, delta] of Object.entries(leaderboardUpdates)) {
        const lbRef = poolSubdoc(activePoolId, competitionId, 'leaderboard', uid);
        const lbSnap = await getDoc(lbRef);
        if (lbSnap.exists()) {
          const current = lbSnap.data();
          await setDoc(lbRef, {
            ...current,
            totalPoints: (current.totalPoints || 0) + delta.points,
            exactResultsCount: (current.exactResultsCount || 0) + delta.exact,
            correctOutcomeCount: (current.correctOutcomeCount || 0) + delta.outcome,
          });
        }
      }
    },
    [activePoolId, competitionId, getMatchBets]
  );

  return { saveBet, getMyBets, getMatchBets, scoreMatch };
}

export function useMyBetsMap(competitionId = null) {
  const { user } = useAuth();
  const { activePoolId } = usePools();
  const [betsMap, setBetsMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activePoolId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    (async () => {
      const q = query(
        poolSubcollection(activePoolId, competitionId, 'bets'),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      if (cancelled) return;
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[data.matchId] = data;
      });
      setBetsMap(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, activePoolId, competitionId]);

  return { betsMap, setBetsMap, loading };
}

export { poolSubcollection, poolSubdoc };
