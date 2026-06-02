import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../hooks/useAuth';
import { usePools } from '../hooks/usePools';

export default function HamburgerMenu({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();
  const { user, profile, isAnonymous, signInWithGoogle, signOutUser } = useAuth();
  const { activePool } = usePools();
  const [linkingAccount, setLinkingAccount] = useState(false);
  const isAdmin = user?.uid && user.uid === import.meta.env.VITE_ADMIN_UID;

  const handleNav = (page) => {
    setOpen(false);
    onNavigate(page);
  };

  const handleShare = async () => {
    const code = activePool?.inviteCode;
    if (!code) return;

    const appUrl = window.location.origin + window.location.pathname;
    const text = t('shareMessage').replace('{code}', code).replace('{url}', appUrl);

    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user cancelled share
      }
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <button
        className="hamburger-btn"
        onClick={() => setOpen(!open)}
        aria-label="Menu"
      >
        <span className={`hamburger-icon ${open ? 'hamburger-icon--open' : ''}`}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && <div className="hamburger-overlay" onClick={() => setOpen(false)} />}

      <div className={`hamburger-menu ${open ? 'hamburger-menu--open' : ''}`}>
        <button className="hamburger-menu__close" onClick={() => setOpen(false)} aria-label="Close menu">
          ✕
        </button>
        {profile && (
          <div className="hamburger-menu__profile">
            <span className="hamburger-menu__avatar">{profile.nickname?.charAt(0).toUpperCase()}</span>
            <div>
              <span className="hamburger-menu__nick">{profile.nickname}</span>
              {activePool && (
                <span className="hamburger-menu__group">{activePool.name}</span>
              )}
            </div>
          </div>
        )}

        <nav className="hamburger-menu__nav">
          <button className="hamburger-menu__item" onClick={() => handleNav('pools')}>
            <span>🎱</span> {t('poolMyPools')}
          </button>
          {activePool && (
            <button className="hamburger-menu__item hamburger-menu__item--share" onClick={handleShare}>
              <span>📩</span> {copied ? t('copiedToClipboard') : t('inviteFriends')}
            </button>
          )}
          <button className="hamburger-menu__item" onClick={() => handleNav('rules')}>
            <span>📋</span> {t('navRules')}
          </button>
          <button className="hamburger-menu__item" onClick={() => handleNav('missing')}>
            <span>👻</span> {t('navMissing')}
          </button>
          {isAdmin && (
            <button className="hamburger-menu__item" onClick={() => handleNav('admin')}>
              <span>🔧</span> Admin
            </button>
          )}
        </nav>

        <div className="hamburger-menu__account">
          {isAnonymous ? (
            <button
              className="hamburger-menu__item hamburger-menu__item--link"
              onClick={async () => {
                setLinkingAccount(true);
                try {
                  await signInWithGoogle();
                } catch (err) {
                  console.error('Link error:', err);
                }
                setLinkingAccount(false);
              }}
              disabled={linkingAccount}
            >
              <span>🔗</span> {linkingAccount ? t('saving') : t('authLinkAccount')}
            </button>
          ) : (
            <>
              {profile?.email && (
                <div className="hamburger-menu__email">{profile.email}</div>
              )}
              <button
                className="hamburger-menu__item hamburger-menu__item--signout"
                onClick={async () => {
                  setOpen(false);
                  await signOutUser();
                }}
              >
                <span>🚪</span> {t('authSignOut')}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
