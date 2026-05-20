import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const VISIT_KEY = 'Copa-Yantai-visit-count';
const DISMISS_KEY = 'Copa-Yantai-install-dismissed';
const MIN_VISITS = 2;
const DISMISS_DAYS = 7;
const SHOW_DELAY = 3000;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function wasDismissedRecently() {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    const diff = Date.now() - Number(ts);
    return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function incrementVisits() {
  try {
    const count = Number(localStorage.getItem(VISIT_KEY) || 0) + 1;
    localStorage.setItem(VISIT_KEY, String(count));
    return count;
  } catch {
    return 0;
  }
}

export default function InstallBanner() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [show, setShow] = useState(false);
  const deferredPromptRef = useRef(null);
  const isiOS = isIOS();

  useEffect(() => {
    // Never show on desktop or if already installed
    if (!isMobile() || isStandalone() || wasDismissedRecently()) return;

    const visits = incrementVisits();
    if (visits < MIN_VISITS) return;

    // Android: capture beforeinstallprompt
    const handlePrompt = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);

    // Show banner after delay
    const timer = setTimeout(() => {
      // On Android, only show if we have the prompt OR if iOS
      if (isiOS || deferredPromptRef.current) {
        setVisible(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setShow(true));
        });
      }
    }, SHOW_DELAY);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handlePrompt);
    };
  }, [isiOS]);

  const handleInstall = async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    deferredPromptRef.current = null;
    setShow(false);
    setTimeout(() => setVisible(false), 300);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShow(false);
    setTimeout(() => setVisible(false), 300);
  };

  if (!visible) return null;

  return (
    <div className={`install-banner ${show ? 'install-banner--show' : ''}`}>
      <button className="install-banner__close" onClick={handleDismiss} aria-label="Close">
        ✕
      </button>
      <div className="install-banner__content">
        <img src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" className="install-banner__icon" />
        <div className="install-banner__text">
          {isiOS ? (
            <>
              <p className="install-banner__msg">{t('installIOSMsg')}</p>
              <p className="install-banner__hint">
                <span className="install-banner__share-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </span>
                {t('installIOSHint')}
              </p>
            </>
          ) : (
            <p className="install-banner__msg">{t('installAndroidMsg')}</p>
          )}
        </div>
      </div>
      {!isiOS && (
        <div className="install-banner__actions">
          <button className="install-banner__btn install-banner__btn--install" onClick={handleInstall}>
            {t('installBtn')}
          </button>
          <button className="install-banner__btn install-banner__btn--later" onClick={handleDismiss}>
            {t('installLater')}
          </button>
        </div>
      )}
      {isiOS && (
        <button className="install-banner__btn install-banner__btn--later install-banner__btn--ios-dismiss" onClick={handleDismiss}>
          {t('installGotIt')}
        </button>
      )}
    </div>
  );
}
