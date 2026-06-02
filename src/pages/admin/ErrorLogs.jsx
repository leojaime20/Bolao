import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, limit, getDocs, doc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const TYPES = ['all', 'NO_POOL', 'SCORE_SAVE_FAILED', 'BET_SAVE_FAILED', 'AUTH_ERROR', 'UNKNOWN'];

export default function ErrorLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const constraints = [
          orderBy('timestamp', 'desc'),
          limit(100),
        ];
        if (filter !== 'all') {
          constraints.unshift(where('type', '==', filter));
        }
        const q = query(collection(db, 'adminLogs'), ...constraints);
        const snap = await getDocs(q);
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load logs:', err);
        // If index is missing, try without orderBy
        try {
          const q = query(collection(db, 'adminLogs'), limit(100));
          const snap = await getDocs(q);
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => {
            const ta = a.timestamp?.seconds || 0;
            const tb = b.timestamp?.seconds || 0;
            return tb - ta;
          });
          setLogs(filter === 'all' ? list : list.filter((l) => l.type === filter));
        } catch {}
      }
      setLoading(false);
    })();
  }, [filter]);

  const handleResolve = async (logId) => {
    await updateDoc(doc(db, 'adminLogs', logId), { resolved: true });
    setLogs((prev) => prev.map((l) => l.id === logId ? { ...l, resolved: true } : l));
  };

  if (loading) return <div className="admin__section"><p className="admin__empty">Carregando...</p></div>;

  return (
    <div className="admin__section">
      <h3>Logs de erro ({logs.length})</h3>

      <div className="admin__filter">
        {TYPES.map((t) => (
          <button
            key={t}
            className={`admin__filter-chip ${filter === t ? 'admin__filter-chip--active' : ''}`}
            onClick={() => setFilter(t)}
          >
            {t === 'all' ? 'Todos' : t}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <p className="admin__empty">Sem erros registrados.</p>
      ) : (
        <table className="admin__table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Mensagem</th>
              <th>Usuário</th>
              <th>Rota</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {log.timestamp?.toDate?.()?.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  }) || '—'}
                </td>
                <td>
                  <span className="admin__badge admin__badge--error">{log.type}</span>
                </td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.message}
                </td>
                <td style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  {log.userId ? log.userId.slice(0, 8) + '...' : '—'}
                </td>
                <td>{log.route || '—'}</td>
                <td>
                  {log.resolved ? (
                    <span className="admin__badge admin__badge--resolved">Resolvido</span>
                  ) : (
                    <span className="admin__badge admin__badge--error">Aberto</span>
                  )}
                </td>
                <td>
                  {!log.resolved && (
                    <button
                      className="admin__btn admin__btn--ghost admin__btn--small"
                      onClick={() => handleResolve(log.id)}
                    >
                      Resolver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
