import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';

const PoolContext = createContext(null);

const ACTIVE_POOL_KEY = 'Copa-Yantai-active-pool';
const ADMIN_UID = import.meta.env.VITE_ADMIN_UID;

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'Copa-Yantai-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function PoolProvider({ children }) {
  const { user, profile } = useAuth();
  const [pools, setPools] = useState([]);
  const [activePoolId, setActivePoolId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_POOL_KEY) || null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Load public pools plus any legacy pools the user joined by code.
  useEffect(() => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const loadedById = new Map();
      const publicPoolsQuery = query(collection(db, 'pools'), where('isPublic', '==', true));
      const publicPoolsSnap = await getDocs(publicPoolsQuery);

      publicPoolsSnap.docs.forEach((poolDoc) => {
        loadedById.set(poolDoc.id, { id: poolDoc.id, ...poolDoc.data() });
      });

      const poolIds = profile.pools || [];
      for (const pid of poolIds) {
        if (loadedById.has(pid)) continue;
        const snap = await getDoc(doc(db, 'pools', pid));
        if (snap.exists()) loadedById.set(snap.id, { id: snap.id, ...snap.data() });
      }
      if (cancelled) return;

      const loaded = Array.from(loadedById.values()).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );
      setPools(loaded);

      // Validate active pool
      const storedActive = localStorage.getItem(ACTIVE_POOL_KEY);
      const validIds = loaded.map((p) => p.id);
      if (storedActive && validIds.includes(storedActive)) {
        setActivePoolId(storedActive);
      } else if (loaded.length > 0) {
        setActivePoolId(loaded[0].id);
        localStorage.setItem(ACTIVE_POOL_KEY, loaded[0].id);
      } else {
        setActivePoolId(null);
        localStorage.removeItem(ACTIVE_POOL_KEY);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, profile]);

  const selectPool = useCallback((poolId) => {
    setActivePoolId(poolId);
    if (poolId) {
      localStorage.setItem(ACTIVE_POOL_KEY, poolId);
    } else {
      localStorage.removeItem(ACTIVE_POOL_KEY);
    }
  }, []);

  const createPool = useCallback(async (name) => {
    if (!user) return null;
    if (user.uid !== ADMIN_UID) throw new Error('NOT_ADMIN');

    // Generate unique invite code
    let inviteCode;
    let exists = true;
    while (exists) {
      inviteCode = generateInviteCode();
      const q = query(collection(db, 'pools'), where('inviteCode', '==', inviteCode));
      const snap = await getDocs(q);
      exists = !snap.empty;
    }

    const poolRef = doc(collection(db, 'pools'));
    const poolData = {
      name,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      inviteCode,
      members: [user.uid],
      isPublic: true,
    };

    await setDoc(poolRef, poolData);

    // Init leaderboard entry
    await setDoc(doc(db, 'pools', poolRef.id, 'leaderboard', user.uid), {
      nickname: profile?.nickname || '',
      matchPoints: 0,
      bonusPoints: 0,
      totalPoints: 0,
      exactResultsCount: 0,
      correctOutcomeCount: 0,
    });

    // Add pool to user's pools array
    await updateDoc(doc(db, 'users', user.uid), {
      pools: arrayUnion(poolRef.id),
    });

    const newPool = { id: poolRef.id, ...poolData };
    setPools((prev) => [...prev, newPool]);
    selectPool(poolRef.id);

    return newPool;
  }, [user, profile, selectPool]);

  const joinPool = useCallback(async (inviteCode) => {
    if (!user) return null;

    const code = inviteCode.trim().toUpperCase();
    const q = query(collection(db, 'pools'), where('inviteCode', '==', code));
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const poolDoc = snap.docs[0];
    const poolData = poolDoc.data();

    // Already visible or already a member?
    if (poolData.isPublic || poolData.members?.includes(user.uid)) {
      await setDoc(doc(db, 'pools', poolDoc.id, 'leaderboard', user.uid), {
        nickname: profile?.nickname || '',
        matchPoints: 0,
        bonusPoints: 0,
        totalPoints: 0,
        exactResultsCount: 0,
        correctOutcomeCount: 0,
      }, { merge: true });
      await updateDoc(doc(db, 'users', user.uid), {
        pools: arrayUnion(poolDoc.id),
      });
      setPools((prev) => (
        prev.some((p) => p.id === poolDoc.id)
          ? prev
          : [...prev, { id: poolDoc.id, ...poolData }]
      ));
      selectPool(poolDoc.id);
      return { id: poolDoc.id, ...poolData };
    }

    // Add user to pool members
    await updateDoc(doc(db, 'pools', poolDoc.id), {
      members: arrayUnion(user.uid),
    });

    // Init leaderboard entry
    await setDoc(doc(db, 'pools', poolDoc.id, 'leaderboard', user.uid), {
      nickname: profile?.nickname || '',
      totalPoints: 0,
      exactResultsCount: 0,
      correctOutcomeCount: 0,
    });

    // Add pool to user's pools array
    await updateDoc(doc(db, 'users', user.uid), {
      pools: arrayUnion(poolDoc.id),
    });

    const joinedPool = { id: poolDoc.id, ...poolData };
    setPools((prev) => (
      prev.some((p) => p.id === poolDoc.id)
        ? prev
        : [...prev, joinedPool]
    ));
    selectPool(poolDoc.id);

    return joinedPool;
  }, [user, profile, selectPool]);

  const updatePool = useCallback(async (poolId, updates) => {
    if (!user) return;
    const pool = pools.find((p) => p.id === poolId);
    if (!pool || pool.createdBy !== user.uid) throw new Error('NOT_ADMIN');

    const allowed = {};
    if (updates.name !== undefined) allowed.name = updates.name;
    await updateDoc(doc(db, 'pools', poolId), allowed);
    setPools((prev) => prev.map((p) => p.id === poolId ? { ...p, ...allowed } : p));
  }, [user, pools]);

  const deletePool = useCallback(async (poolId) => {
    if (!user) return;
    const pool = pools.find((p) => p.id === poolId);
    if (!pool || pool.createdBy !== user.uid) throw new Error('NOT_ADMIN');

    // Delete subcollections
    for (const sub of ['bets', 'leaderboard']) {
      const subSnap = await getDocs(collection(db, 'pools', poolId, sub));
      const batch = writeBatch(db);
      subSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete pool doc
    await deleteDoc(doc(db, 'pools', poolId));

    // Remove pool from current user
    await updateDoc(doc(db, 'users', user.uid), {
      pools: arrayRemove(poolId),
    });

    setPools((prev) => prev.filter((p) => p.id !== poolId));
    if (activePoolId === poolId) {
      const remaining = pools.filter((p) => p.id !== poolId);
      selectPool(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [user, pools, activePoolId, selectPool]);

  const removeMember = useCallback(async (poolId, memberUid) => {
    if (!user) return;
    const pool = pools.find((p) => p.id === poolId);
    if (!pool || pool.createdBy !== user.uid) throw new Error('NOT_ADMIN');
    if (memberUid === user.uid) throw new Error('CANNOT_REMOVE_SELF');

    await updateDoc(doc(db, 'pools', poolId), {
      members: arrayRemove(memberUid),
    });

    // Remove leaderboard entry
    await deleteDoc(doc(db, 'pools', poolId, 'leaderboard', memberUid));

    // Remove pool from member's user doc
    await updateDoc(doc(db, 'users', memberUid), {
      pools: arrayRemove(poolId),
    });

    setPools((prev) => prev.map((p) =>
      p.id === poolId
        ? { ...p, members: (p.members || []).filter((m) => m !== memberUid) }
        : p
    ));
  }, [user, pools]);

  const leavePool = useCallback(async (poolId) => {
    if (!user) return;
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) return;
    if (pool.isPublic) {
      selectPool(null);
      return;
    }
    if (pool.createdBy === user.uid) throw new Error('OWNER_CANNOT_LEAVE');

    await updateDoc(doc(db, 'pools', poolId), {
      members: arrayRemove(user.uid),
    });

    await deleteDoc(doc(db, 'pools', poolId, 'leaderboard', user.uid));

    await updateDoc(doc(db, 'users', user.uid), {
      pools: arrayRemove(poolId),
    });

    setPools((prev) => prev.filter((p) => p.id !== poolId));
    if (activePoolId === poolId) {
      const remaining = pools.filter((p) => p.id !== poolId);
      selectPool(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [user, pools, activePoolId, selectPool]);

  const regenerateInviteCode = useCallback(async (poolId) => {
    if (!user) return;
    const pool = pools.find((p) => p.id === poolId);
    if (!pool || pool.createdBy !== user.uid) throw new Error('NOT_ADMIN');

    let inviteCode;
    let exists = true;
    while (exists) {
      inviteCode = generateInviteCode();
      const q = query(collection(db, 'pools'), where('inviteCode', '==', inviteCode));
      const snap = await getDocs(q);
      exists = !snap.empty;
    }

    await updateDoc(doc(db, 'pools', poolId), { inviteCode });
    setPools((prev) => prev.map((p) => p.id === poolId ? { ...p, inviteCode } : p));
    return inviteCode;
  }, [user, pools]);

  const getPoolMembers = useCallback(async (poolId) => {
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) return [];

    const members = pool.members || [];
    const result = [];
    for (const uid of members) {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const lbSnap = await getDoc(doc(db, 'pools', poolId, 'leaderboard', uid));
      result.push({
        uid,
        nickname: userSnap.exists() ? userSnap.data().nickname : '?',
        totalPoints: lbSnap.exists() ? lbSnap.data().totalPoints || 0 : 0,
        isAdmin: pool.createdBy === uid,
      });
    }
    return result.sort((a, b) => b.totalPoints - a.totalPoints);
  }, [pools]);

  const activePool = pools.find((p) => p.id === activePoolId) || null;
  const canCreatePool = Boolean(user?.uid && user.uid === ADMIN_UID);

  return (
    <PoolContext.Provider value={{
      pools,
      activePool,
      activePoolId,
      canCreatePool,
      selectPool,
      createPool,
      joinPool,
      updatePool,
      deletePool,
      removeMember,
      leavePool,
      regenerateInviteCode,
      getPoolMembers,
      loading,
    }}>
      {children}
    </PoolContext.Provider>
  );
}

export function usePools() {
  const ctx = useContext(PoolContext);
  if (!ctx) throw new Error('usePools must be used within PoolProvider');
  return ctx;
}
