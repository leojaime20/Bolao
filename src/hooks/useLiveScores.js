import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { usePools } from './usePools';
import { getTodayMatches, mapApiStatus, extractScore } from '../utils/footballApi';
import { poolSubcollection } from './useBets';

const POLL_INTERVAL = 60_000;

export function useLiveScores() {
  const { activePoolId } = usePools();
  const [liveData, setLiveData] = useState({});
  const [hasLive, setHasLive] = useState(false);
  const timerRef = useRef(null);

  const fetchScores = useCallback(async () => {
    try {
      const data = await getTodayMatches();
      if (!data.matches) return;

      const updates = {};
      let anyLive = false;

      for (const m of data.matches) {
        const status = mapApiStatus(m.status);
        const score = extractScore(m);
        updates[m.id] = { status, score, apiMatchId: m.id };
        if (status === 'live') anyLive = true;

        if (status === 'finished' && score && activePoolId) {
          await setDoc(
            doc(db, 'pools', activePoolId, 'matches', String(m.id)),
            { status, scoreHome: score.home, scoreAway: score.away },
            { merge: true }
          );
        }
      }

      setLiveData(updates);
      setHasLive(anyLive);
    } catch {
      // Silently fail — will retry on next poll
    }
  }, [activePoolId]);

  useEffect(() => {
    fetchScores();
    return () => clearInterval(timerRef.current);
  }, [fetchScores]);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (hasLive) {
      timerRef.current = setInterval(fetchScores, POLL_INTERVAL);
    }
    return () => clearInterval(timerRef.current);
  }, [hasLive, fetchScores]);

  return { liveData, hasLive, refetch: fetchScores };
}

export function useCachedScores(competitionId = null) {
  const { activePoolId } = usePools();
  const [scores, setScores] = useState({});

  useEffect(() => {
    if (!activePoolId) {
      setScores({});
      return;
    }
    let cancelled = false;
    (async () => {
      const snap = await getDocs(poolSubcollection(activePoolId, competitionId, 'matches'));
      if (cancelled) return;
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setScores(map);
    })();
    return () => { cancelled = true; };
  }, [activePoolId, competitionId]);

  return scores;
}
