import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePools } from '../hooks/usePools';
import { useLanguage } from '../i18n/LanguageContext';
import ConfirmModal from './ConfirmModal';

export default function PoolAdmin({ poolId, onBack }) {
  const { user } = useAuth();
  const {
    pools, updatePool, deletePool, removeMember, leavePool,
    regenerateInviteCode, getPoolMembers,
  } = usePools();
  const { t } = useLanguage();

  const pool = pools.find((p) => p.id === poolId);
  const isAdmin = pool?.createdBy === user?.uid;

  const [view, setView] = useState('detail'); // 'detail' | 'members' | 'edit'
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [editName, setEditName] = useState(pool?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // { type, data }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (view === 'members' && poolId) {
      setLoadingMembers(true);
      getPoolMembers(poolId).then((m) => {
        setMembers(m);
        setLoadingMembers(false);
      });
    }
  }, [view, poolId, getPoolMembers]);

  const handleCopy = async () => {
    const appUrl = window.location.origin + window.location.pathname;
    const text = t('shareMessage').replace('{code}', pool.inviteCode).replace('{url}', appUrl);
    if (navigator.share) {
      try { await navigator.share({ text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    const trimName = editName.trim();
    if (!trimName || trimName.length < 2) {
      setError(t('poolNameMinLength'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updatePool(poolId, { name: trimName });
      setView('detail');
    } catch {
      setError(t('poolCreateError'));
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setConfirm(null);
    setSaving(true);
    try {
      await deletePool(poolId);
      onBack();
    } catch (err) {
      console.error('Delete pool error:', err);
      setError(t('poolDeleteError'));
    }
    setSaving(false);
  };

  const handleRemoveMember = async (uid) => {
    setConfirm(null);
    setSaving(true);
    try {
      await removeMember(poolId, uid);
      setMembers((prev) => prev.filter((m) => m.uid !== uid));
    } catch (err) {
      console.error('Remove member error:', err);
    }
    setSaving(false);
  };

  const handleLeave = async () => {
    setConfirm(null);
    setSaving(true);
    try {
      await leavePool(poolId);
      onBack();
    } catch (err) {
      if (err.message === 'OWNER_CANNOT_LEAVE') {
        setError(t('poolOwnerCannotLeave'));
      }
    }
    setSaving(false);
  };

  const handleRegenerateCode = async () => {
    setConfirm(null);
    setSaving(true);
    try {
      await regenerateInviteCode(poolId);
    } catch (err) {
      console.error('Regenerate code error:', err);
    }
    setSaving(false);
  };

  if (!pool) return null;

  // Edit view
  if (view === 'edit') {
    return (
      <div className="pool-admin">
        <button className="pool-manager__back" onClick={() => { setView('detail'); setError(''); }}>
          ← {t('back')}
        </button>
        <h3 className="pool-manager__title">{t('poolEdit')}</h3>
        <form onSubmit={handleEditSave}>
          <label className="modal__label">
            {t('poolNameLabel')}
            <input
              className="modal__input"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={30}
              autoFocus
            />
          </label>
          {error && <p className="modal__error">{error}</p>}
          <button className="modal__btn" type="submit" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </form>
      </div>
    );
  }

  // Members view
  if (view === 'members') {
    return (
      <div className="pool-admin">
        <button className="pool-manager__back" onClick={() => setView('detail')}>
          ← {t('back')}
        </button>
        <h3 className="pool-manager__title">
          {t('poolMembers')} ({pool.members?.length || 0})
        </h3>

        {loadingMembers ? (
          <div className="pool-admin__loading">{t('loading')}</div>
        ) : (
          <div className="pool-admin__members">
            {members.map((member) => (
              <div key={member.uid} className="pool-admin__member">
                <div className="pool-admin__member-info">
                  <span className="pool-admin__member-avatar">
                    {member.nickname?.charAt(0).toUpperCase() || '?'}
                  </span>
                  <div>
                    <span className="pool-admin__member-name">
                      {member.nickname}
                      {member.isAdmin && (
                        <span className="pool-admin__admin-badge">{t('poolAdmin')}</span>
                      )}
                      {member.uid === user?.uid && (
                        <span className="pool-admin__you-badge">{t('you')}</span>
                      )}
                    </span>
                    <span className="pool-admin__member-points">
                      {member.totalPoints} {t('pts')}
                    </span>
                  </div>
                </div>
                {isAdmin && !member.isAdmin && member.uid !== user?.uid && (
                  <button
                    className="pool-admin__remove-btn"
                    onClick={() => setConfirm({
                      type: 'remove',
                      data: member,
                    })}
                    disabled={saving}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {confirm?.type === 'remove' && (
          <ConfirmModal
            title={t('poolRemoveMember')}
            message={t('poolRemoveConfirm').replace('{name}', confirm.data.nickname)}
            confirmLabel={t('poolRemoveMember')}
            onConfirm={() => handleRemoveMember(confirm.data.uid)}
            onCancel={() => setConfirm(null)}
            danger
          />
        )}
      </div>
    );
  }

  // Detail view
  return (
    <div className="pool-admin">
      <button className="pool-manager__back" onClick={onBack}>
        ← {t('back')}
      </button>
      <h3 className="pool-manager__title">{t('poolSettings')}</h3>

      <div className="pool-admin__detail">
        <div className="pool-admin__field">
          <span className="pool-admin__field-label">{t('poolNameLabel')}</span>
          <span className="pool-admin__field-value">{pool.name}</span>
        </div>

        <div className="pool-admin__field">
          <span className="pool-admin__field-label">{t('poolInviteCode')}</span>
          <span className="pool-admin__field-value pool-admin__field-value--code">{pool.inviteCode}</span>
        </div>

        <div className="pool-admin__field">
          <span className="pool-admin__field-label">{t('poolMembers')}</span>
          <span className="pool-admin__field-value">{pool.members?.length || 0}</span>
        </div>
      </div>

      {error && <p className="modal__error">{error}</p>}

      <div className="pool-admin__actions">
        <button className="pool-admin__action" onClick={handleCopy}>
          📩 {copied ? t('copiedToClipboard') : t('poolShareCode')}
        </button>

        <button className="pool-admin__action" onClick={() => setView('members')}>
          👥 {t('poolMembers')}
        </button>

        {isAdmin && (
          <>
            <button className="pool-admin__action" onClick={() => { setEditName(pool.name); setView('edit'); setError(''); }}>
              ✏️ {t('poolEdit')}
            </button>

            <button
              className="pool-admin__action"
              onClick={() => setConfirm({ type: 'regenerate' })}
              disabled={saving}
            >
              🔄 {t('poolRegenerateCode')}
            </button>

            <button
              className="pool-admin__action pool-admin__action--danger"
              onClick={() => setConfirm({ type: 'delete' })}
              disabled={saving}
            >
              🗑️ {t('poolDelete')}
            </button>
          </>
        )}

        {!isAdmin && !pool.isPublic && (
          <button
            className="pool-admin__action pool-admin__action--danger"
            onClick={() => setConfirm({ type: 'leave' })}
            disabled={saving}
          >
            🚪 {t('poolLeave')}
          </button>
        )}
      </div>

      {confirm?.type === 'delete' && (
        <ConfirmModal
          title={t('poolDelete')}
          message={t('poolDeleteConfirm')}
          confirmLabel={t('poolDeleteBtn')}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
          danger
        />
      )}

      {confirm?.type === 'leave' && (
        <ConfirmModal
          title={t('poolLeave')}
          message={t('poolLeaveConfirm')}
          confirmLabel={t('poolLeave')}
          onConfirm={handleLeave}
          onCancel={() => setConfirm(null)}
          danger
        />
      )}

      {confirm?.type === 'regenerate' && (
        <ConfirmModal
          title={t('poolRegenerateCode')}
          message={t('poolRegenerateConfirm')}
          confirmLabel={t('confirm')}
          onConfirm={handleRegenerateCode}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
