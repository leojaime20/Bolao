import { useState } from 'react';
import { usePools } from '../hooks/usePools';
import { useLanguage } from '../i18n/LanguageContext';
import PoolAdmin from './PoolAdmin';

export default function PoolManager() {
  const { pools, activePoolId, selectPool, createPool, joinPool, canCreatePool } = usePools();
  const { t } = useLanguage();
  const [view, setView] = useState('list');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdPool, setCreatedPool] = useState(null);
  const [copied, setCopied] = useState(false);
  const [adminPoolId, setAdminPoolId] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    const trimName = name.trim();
    if (!trimName || trimName.length < 2) {
      setError(t('poolNameMinLength'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const pool = await createPool(trimName);
      setCreatedPool(pool);
      setView('created');
      setName('');
    } catch {
      setError(t('poolCreateError'));
    }
    setSaving(false);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const trimCode = code.trim();
    if (!trimCode) {
      setError(t('poolCodeRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const pool = await joinPool(trimCode);
      if (!pool) {
        setError(t('poolCodeNotFound'));
        setSaving(false);
        return;
      }
      setView('list');
      setCode('');
    } catch {
      setError(t('poolJoinError'));
    }
    setSaving(false);
  };

  const handleCopy = async (inviteCode) => {
    const appUrl = window.location.origin + window.location.pathname;
    const text = t('shareMessage').replace('{code}', inviteCode).replace('{url}', appUrl);
    if (navigator.share) {
      try { await navigator.share({ text }); } catch {
        // User cancelled the native share sheet.
      }
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Admin view
  if (view === 'admin' && adminPoolId) {
    return (
      <PoolAdmin
        poolId={adminPoolId}
        onBack={() => { setView('list'); setAdminPoolId(null); }}
      />
    );
  }

  if (view === 'created' && createdPool) {
    return (
      <div className="pool-manager">
        <div className="pool-manager__success">
          <span className="pool-manager__success-icon">🎉</span>
          <h3 className="pool-manager__success-title">{t('poolCreated')}</h3>
          <p className="pool-manager__success-name">{createdPool.name}</p>

          <div className="pool-manager__code-display">
            <span className="pool-manager__code-label">{t('poolInviteCode')}</span>
            <span className="pool-manager__code-value">{createdPool.inviteCode}</span>
          </div>

          <button className="pool-manager__share-btn" onClick={() => handleCopy(createdPool.inviteCode)}>
            {copied ? t('copiedToClipboard') : t('poolShareCode')}
          </button>

          <button className="pool-manager__done-btn" onClick={() => { setView('list'); setCreatedPool(null); }}>
            {t('done')}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    if (!canCreatePool) {
      return (
        <div className="pool-manager">
          <button className="pool-manager__back" onClick={() => { setView('list'); setError(''); }}>
            ← {t('back')}
          </button>
          <h3 className="pool-manager__title">{t('poolCreateTitle')}</h3>
          <p className="pool-manager__empty">{t('poolCreateAdminOnly')}</p>
        </div>
      );
    }

    return (
      <div className="pool-manager">
        <button className="pool-manager__back" onClick={() => { setView('list'); setError(''); }}>
          ← {t('back')}
        </button>
        <h3 className="pool-manager__title">{t('poolCreateTitle')}</h3>
        <form onSubmit={handleCreate}>
          <label className="modal__label">
            {t('poolNameLabel')}
            <input
              className="modal__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('poolNamePlaceholder')}
              maxLength={30}
              autoFocus
            />
          </label>
          {error && <p className="modal__error">{error}</p>}
          <button className="modal__btn" type="submit" disabled={saving}>
            {saving ? t('saving') : t('poolCreateBtn')}
          </button>
        </form>
      </div>
    );
  }

  if (view === 'join') {
    return (
      <div className="pool-manager">
        <button className="pool-manager__back" onClick={() => { setView('list'); setError(''); }}>
          ← {t('back')}
        </button>
        <h3 className="pool-manager__title">{t('poolJoinTitle')}</h3>
        <form onSubmit={handleJoin}>
          <label className="modal__label">
            {t('poolCodeLabel')}
            <input
              className="modal__input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('poolCodePlaceholder')}
              maxLength={32}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              autoFocus
            />
          </label>
          {error && <p className="modal__error">{error}</p>}
          <button className="modal__btn" type="submit" disabled={saving}>
            {saving ? t('saving') : t('poolJoinBtn')}
          </button>
        </form>
      </div>
    );
  }

  // List view
  return (
    <div className="pool-manager">
      <h3 className="pool-manager__title">{t('poolMyPools')}</h3>

      {pools.length > 0 ? (
        <div className="pool-manager__list">
          {pools.map((pool) => (
            <div
              key={pool.id}
              className={`pool-manager__item ${pool.id === activePoolId ? 'pool-manager__item--active' : ''}`}
            >
              <button
                className="pool-manager__item-main"
                onClick={() => selectPool(pool.id)}
              >
                <div className="pool-manager__item-info">
                  <span className="pool-manager__item-name">{pool.name}</span>
                  <span className="pool-manager__item-code">
                    {pool.inviteCode} · {pool.members?.length || 0} {t('poolMemberCount')}
                  </span>
                </div>
                {pool.id === activePoolId && <span className="pool-manager__item-check">✓</span>}
              </button>
              <button
                className="pool-manager__item-settings"
                onClick={() => { setAdminPoolId(pool.id); setView('admin'); }}
                aria-label={t('poolSettings')}
              >
                ⚙️
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="pool-manager__empty">{t('poolNoPools')}</p>
      )}

      <div className="pool-manager__actions">
        {canCreatePool && (
          <button className="pool-manager__action-btn pool-manager__action-btn--create" onClick={() => setView('create')}>
            + {t('poolCreateBtn')}
          </button>
        )}
        <button className="pool-manager__action-btn" onClick={() => setView('join')}>
          {t('poolJoinBtn')}
        </button>
      </div>
    </div>
  );
}
