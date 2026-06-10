import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../i18n/LanguageContext';

export default function AuthScreen() {
  const { saveProfile, signInWithGoogle, signInWithEmail, user, profile } = useAuth();
  const { t } = useLanguage();

  // Anonymous sessions must choose a permanent login before entering the app.
  const alreadyAuthenticated = user && !user.isAnonymous;
  const existingGuest = Boolean(user?.isAnonymous && profile?.nickname);
  const [step, setStep] = useState(alreadyAuthenticated ? 'nickname' : 'choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Update nickname default when user/profile changes (e.g., after Google sign-in)
  useEffect(() => {
    if (!nickname) {
      setNickname(user?.displayName || profile?.nickname || '');
    }
  }, [user, profile]);

  // If auth state changes to authenticated, move to nickname step
  useEffect(() => {
    if (step === 'choose' && user && !user.isAnonymous) {
      setStep('nickname');
    }
  }, [user, step]);

  const handleGoogle = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await signInWithGoogle();
      if (result) {
        setNickname(result.displayName || '');
        setStep('nickname');
      }
    } catch (err) {
      console.error('Google sign-in error:', err);
      if (err.code === 'auth/popup-blocked') {
        setError(t('authPopupBlocked'));
      } else if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError(''); // user-initiated cancel; no error shown
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(t('authUnauthorizedDomain'));
      } else if (err.code === 'auth/account-already-exists') {
        setError(t('authAccountAlreadyExists'));
      } else {
        setError(t('authGoogleError'));
      }
    }
    setSaving(false);
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const trimEmail = email.trim();
    if (!trimEmail || !password) {
      setError(t('authFieldsRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('authPasswordMin'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await signInWithEmail(trimEmail, password, isSignUp);
      setStep('nickname');
    } catch (err) {
      console.error('Email sign-in error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError(t('authWrongPassword'));
      } else if (err.code === 'auth/user-not-found') {
        setError(t('authUserNotFound'));
      } else if (err.code === 'auth/weak-password') {
        setError(t('authPasswordMin'));
      } else if (err.code === 'auth/account-already-exists') {
        setError(t('authAccountAlreadyExists'));
      } else {
        setError(t('authEmailError'));
      }
    }
    setSaving(false);
  };

  const handleNickname = async (e) => {
    e.preventDefault();
    const trimNick = nickname.trim();
    if (!trimNick || trimNick.length < 2) {
      setError(t('nicknameMinLength'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveProfile(trimNick);
    } catch {
      setError(t('nicknameSaveError'));
      setSaving(false);
    }
  };

  if (step === 'nickname') {
    return (
      <div className="modal-overlay">
        <form className="modal" onSubmit={handleNickname}>
          <span className="modal__icon">⚽</span>
          <h2 className="modal__title">{t('welcomeTitle')}</h2>
          <p className="modal__subtitle">{t('welcomeSubtitleSimple')}</p>

          <label className="modal__label">
            {t('nicknameLabel')}
            <input
              className="modal__input"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('nicknamePlaceholder')}
              maxLength={20}
              autoFocus
            />
          </label>

          {error && <p className="modal__error">{error}</p>}

          <button className="modal__btn" type="submit" disabled={saving}>
            {saving ? t('saving') : t('startBtn')}
          </button>
        </form>
      </div>
    );
  }

  if (step === 'email') {
    return (
      <div className="modal-overlay">
        <form className="modal" onSubmit={handleEmailSubmit}>
          <span className="modal__icon">📧</span>
          <h2 className="modal__title">{isSignUp ? t('authSignUp') : t('authSignIn')}</h2>

          <label className="modal__label">
            {t('authEmailLabel')}
            <input
              className="modal__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              autoFocus
            />
          </label>

          <label className="modal__label">
            {t('authPasswordLabel')}
            <input
              className="modal__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </label>

          {error && <p className="modal__error">{error}</p>}

          <button className="modal__btn" type="submit" disabled={saving}>
            {saving ? t('saving') : (isSignUp ? t('authSignUp') : t('authSignIn'))}
          </button>

          <button
            type="button"
            className="auth-screen__toggle"
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          >
            {isSignUp ? t('authHasAccount') : t('authNoAccount')}
          </button>

          <button
            type="button"
            className="auth-screen__back"
            onClick={() => { setStep('choose'); setError(''); }}
          >
            ← {t('back')}
          </button>
        </form>
      </div>
    );
  }

  // step === 'choose'
  return (
    <div className="modal-overlay">
      <div className="modal">
        <span className="modal__icon">⚽</span>
        <h2 className="modal__title">
          {existingGuest ? t('authProtectTitle') : t('welcomeTitle')}
        </h2>
        <p className="modal__subtitle">
          {existingGuest ? t('authProtectExisting') : t('authRequired')}
        </p>

        {error && <p className="modal__error">{error}</p>}

        <button
          className="auth-screen__google-btn"
          onClick={handleGoogle}
          disabled={saving}
        >
          <svg className="auth-screen__google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {existingGuest ? t('authLinkAccount') : t('authGoogle')}
        </button>

        <button
          className="auth-screen__email-btn"
          onClick={() => {
            setIsSignUp(false);
            setStep('email');
            setError('');
          }}
          disabled={saving}
        >
          📧 {existingGuest ? t('authLinkEmail') : t('authEmail')}
        </button>

        {existingGuest && (
          <p className="auth-screen__hint auth-screen__hint--protect">
            {t('authProtectHint')}
          </p>
        )}
      </div>
    </div>
  );
}
