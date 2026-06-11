import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import {
  signInAnonymously,
  onAuthStateChanged,
  signInWithPopup,
  linkWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import * as Sentry from '@sentry/react';

const AuthContext = createContext(null);

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';

// ── Helpers ──────────────────────────────────────────────

async function ensureUserDoc(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // Update login analytics + merge any new auth info
    const updates = {
      lastLoginAt: serverTimestamp(),
      loginCount: increment(1),
      appVersion: APP_VERSION,
    };
    if (firebaseUser.email) updates.email = firebaseUser.email;
    if (firebaseUser.photoURL) updates.photoURL = firebaseUser.photoURL;
    try { await updateDoc(ref, updates); } catch {}

    const data = snap.data();
    // Return fresh data with merged fields
    return {
      ...data,
      email: firebaseUser.email || data.email || '',
      photoURL: firebaseUser.photoURL || data.photoURL || '',
    };
  }

  // No doc yet — create one
  const data = {
    nickname: firebaseUser.displayName || '',
    email: firebaseUser.email || '',
    photoURL: firebaseUser.photoURL || '',
    pools: [],
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    loginCount: 1,
    appVersion: APP_VERSION,
  };
  await setDoc(ref, data);
  return data;
}

async function migrateGroupToPool(uid, groupCode, nickname) {
  const q = query(collection(db, 'pools'), where('inviteCode', '==', groupCode));
  const snap = await getDocs(q);

  // Legacy clients may join an already migrated pool, but only the
  // administrative workflow is allowed to create a new pool.
  if (snap.empty) return null;

  const poolId = snap.docs[0].id;
  const poolData = snap.docs[0].data();
  if (!poolData.isPublic && !poolData.members?.includes(uid)) return null;

  const lbRef = doc(db, 'pools', poolId, 'leaderboard', uid);
  const lbSnap = await getDoc(lbRef);
  if (!lbSnap.exists()) {
    await setDoc(lbRef, {
      nickname: nickname || '',
      totalPoints: 0,
      exactResultsCount: 0,
      correctOutcomeCount: 0,
    });
  }

  await updateDoc(doc(db, 'users', uid), { pools: arrayUnion(poolId) });
  return poolId;
}

function accountAlreadyExistsError() {
  const error = new Error('This login is already linked to another account.');
  error.code = 'auth/account-already-exists';
  return error;
}

// ── Provider ─────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Prevent onAuthStateChanged from overwriting profile while signIn is in progress
  const signInInProgress = useRef(false);

  // Single source of truth: onAuthStateChanged
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          // No user at all — create anonymous session
          setUser(null);
          setProfile(null);
          await signInAnonymously(auth);
          return;
        }

        setUser(firebaseUser);
        Sentry.setUser({ id: firebaseUser.uid, email: firebaseUser.email || undefined });

        // If a signIn function is handling the profile, let it finish
        if (signInInProgress.current) {
          setLoading(false);
          return;
        }

        if (firebaseUser.isAnonymous) {
          // Existing guest profiles must remain available so the account can be
          // linked without losing the UID that owns its predictions.
          const guestProfile = await getDoc(doc(db, 'users', firebaseUser.uid));
          setProfile(guestProfile.exists() ? guestProfile.data() : null);
        } else {
          // Real user — ensure doc exists, load profile
          const data = await ensureUserDoc(firebaseUser);

          // Legacy migration
          if (data.groupCode && (!data.pools || data.pools.length === 0)) {
            await migrateGroupToPool(firebaseUser.uid, data.groupCode, data.nickname);
            const updated = await getDoc(doc(db, 'users', firebaseUser.uid));
            setProfile(updated.data());
          } else {
            setProfile(data);
          }
        }
      } catch (err) {
        console.error('Auth error:', err);
      }
      setLoading(false);
    });

    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const currentUser = auth.currentUser;
    const wasAnonymous = currentUser?.isAnonymous;
    const hasGuestProfile = Boolean(wasAnonymous && profile?.nickname);

    signInInProgress.current = true;

    try {
      let resultUser;

      if (hasGuestProfile) {
        const result = await linkWithPopup(currentUser, googleProvider);
        resultUser = result.user;
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        resultUser = result.user;
      }

      setUser(resultUser);
      const data = await ensureUserDoc(resultUser);
      setProfile(data);
      return resultUser;
    } catch (err) {
      if (err.code === 'auth/credential-already-in-use') {
        throw accountAlreadyExistsError();
      }
      throw err;
    } finally {
      signInInProgress.current = false;
    }
  }, [profile]);

  const signInWithEmail = useCallback(async (email, password, isSignUp) => {
    const currentUser = auth.currentUser;
    const wasAnonymous = currentUser?.isAnonymous;

    signInInProgress.current = true;

    try {
      let resultUser;

      if (wasAnonymous && isSignUp) {
        const credential = EmailAuthProvider.credential(email, password);
        const result = await linkWithCredential(currentUser, credential);
        resultUser = result.user;
      } else if (isSignUp) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        resultUser = result.user;
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        resultUser = result.user;
      }

      setUser(resultUser);
      const data = await ensureUserDoc(resultUser);
      setProfile(data);
      return resultUser;
    } catch (err) {
      if (err.code === 'auth/credential-already-in-use' || err.code === 'auth/email-already-in-use') {
        throw accountAlreadyExistsError();
      }
      throw err;
    } finally {
      signInInProgress.current = false;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    try { localStorage.removeItem('Copa-Yantai-active-pool'); } catch {}
    await signInAnonymously(auth);
  }, []);

  const saveProfile = useCallback(async (nickname) => {
    if (!user) return;
    // Only update nickname — never overwrite pools or other fields
    await updateDoc(doc(db, 'users', user.uid), { nickname }).catch(async () => {
      // Doc might not exist yet (guest flow)
      await setDoc(doc(db, 'users', user.uid), {
        nickname,
        email: user.email || '',
        photoURL: user.photoURL || '',
        pools: [],
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        loginCount: 1,
        appVersion: APP_VERSION,
      });
    });
    setProfile((prev) => ({ ...prev, nickname }));
  }, [user]);

  const isAnonymous = user?.isAnonymous ?? true;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isAnonymous,
      saveProfile,
      signInWithGoogle,
      signInWithEmail,
      signOutUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
