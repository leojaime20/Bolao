import { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, getDoc, deleteDoc, updateDoc, arrayRemove, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import ConfirmModal from '../../components/ConfirmModal';

export default function PoolsAdmin() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'pools'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPools(list);
      setLoading(false);
    })();
  }, []);

  const loadMembers = async (pool) => {
    setSelectedPool(pool);
    setLoadingMembers(true);
    const memberList = [];
    for (const uid of (pool.members || [])) {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const lbSnap = await getDoc(doc(db, 'pools', pool.id, 'leaderboard', uid));
      const betsSnap = await getDocs(collection(db, 'pools', pool.id, 'bets'));
      const userBets = betsSnap.docs.filter((d) => d.data().userId === uid).length;
      memberList.push({
        uid,
        nickname: userSnap.exists() ? userSnap.data().nickname : '?',
        email: userSnap.exists() ? userSnap.data().email || '' : '',
        photoURL: userSnap.exists() ? userSnap.data().photoURL || '' : '',
        totalPoints: lbSnap.exists() ? lbSnap.data().totalPoints || 0 : 0,
        betCount: userBets,
      });
    }
    setMembers(memberList.sort((a, b) => b.totalPoints - a.totalPoints));
    setLoadingMembers(false);
  };

  const handleDeletePool = async (poolId) => {
    setConfirm(null);
    for (const sub of ['bets', 'leaderboard']) {
      const subSnap = await getDocs(collection(db, 'pools', poolId, sub));
      const batch = writeBatch(db);
      subSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    const pool = pools.find((p) => p.id === poolId);
    if (pool) {
      for (const uid of (pool.members || [])) {
        try {
          await updateDoc(doc(db, 'users', uid), { pools: arrayRemove(poolId) });
        } catch {}
      }
    }
    await deleteDoc(doc(db, 'pools', poolId));
    setPools((prev) => prev.filter((p) => p.id !== poolId));
    if (selectedPool?.id === poolId) setSelectedPool(null);
  };

  if (loading) return <div className="admin__section"><p className="admin__empty">Carregando...</p></div>;

  if (selectedPool) {
    return (
      <div className="admin__section">
        <button className="pool-manager__back" onClick={() => setSelectedPool(null)}>
          ← Voltar
        </button>
        <h3>{selectedPool.name}</h3>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          Código: {selectedPool.inviteCode} · {selectedPool.members?.length || 0} membros
        </p>

        {loadingMembers ? (
          <p className="admin__empty">Carregando membros...</p>
        ) : (
          <table className="admin__table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Pontos</th>
                <th>Palpites</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.uid}>
                  <td style={{ fontWeight: 600 }}>
                    {m.nickname || '—'}
                    {m.uid === selectedPool.createdBy && (
                      <span className="admin__badge admin__badge--finished" style={{ marginLeft: 6 }}>Admin</span>
                    )}
                  </td>
                  <td>{m.email || '—'}</td>
                  <td>{m.totalPoints}</td>
                  <td>{m.betCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="admin__section">
      <h3>Bolões ({pools.length})</h3>
      <table className="admin__table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Código</th>
            <th>Membros</th>
            <th>Criado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool) => (
            <tr key={pool.id}>
              <td>
                <button
                  style={{ fontWeight: 600, color: 'var(--green-dark)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => loadMembers(pool)}
                >
                  {pool.name}
                </button>
              </td>
              <td style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>{pool.inviteCode}</td>
              <td>{pool.members?.length || 0}</td>
              <td>{pool.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || '—'}</td>
              <td>
                <button
                  className="admin__btn admin__btn--danger admin__btn--small"
                  onClick={() => setConfirm({ poolId: pool.id, poolName: pool.name })}
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirm && (
        <ConfirmModal
          title="Excluir bolão"
          message={`Excluir "${confirm.poolName}" e todos os palpites/rankings? Não pode ser desfeito.`}
          confirmLabel="Excluir"
          onConfirm={() => handleDeletePool(confirm.poolId)}
          onCancel={() => setConfirm(null)}
          danger
        />
      )}
    </div>
  );
}
