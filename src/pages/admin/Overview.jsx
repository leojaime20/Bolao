import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, getDocs, getCountFromServer,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

export default function Overview() {
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    totalPools: 0,
    totalBets: 0,
    bets24h: 0,
    unresolvedErrors: 0,
  });
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const [usersSnap, poolsSnap, competitionsSnap, logsSnap] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getDocs(collection(db, 'pools')),
        getDocs(collection(db, 'competitions')),
        getCountFromServer(query(
          collection(db, 'adminLogs'),
          where('resolved', '==', false)
        )),
      ]);

      const pools = poolsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const competitionIds = competitionsSnap.docs.map((d) => d.id);
      let totalBets = 0;
      let bets24h = 0;
      const now = Timestamp.now();
      const oneDayAgo = new Timestamp(now.seconds - 86400, 0);

      for (const pool of pools) {
        const snapshots = await Promise.all([
          getDocs(collection(db, 'pools', pool.id, 'bets')),
          ...competitionIds.map((competitionId) => getDocs(
            collection(db, 'pools', pool.id, 'competitions', competitionId, 'bets')
          )),
        ]);
        for (const betsSnap of snapshots) {
          totalBets += betsSnap.size;
          betsSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.updatedAt && data.updatedAt > oneDayAgo) {
              bets24h++;
            }
          });
        }
      }

      setMetrics({
        totalUsers: usersSnap.data().count,
        totalPools: pools.length,
        totalBets,
        bets24h,
        unresolvedErrors: logsSnap.data().count,
      });
      setLoading(false);
    } catch (err) {
      console.error('Failed to load metrics:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();

    if (!live) return;

    // Listen to adminLogs for real-time error count
    const unsub = onSnapshot(
      query(collection(db, 'adminLogs'), where('resolved', '==', false)),
      (snap) => {
        setMetrics((prev) => ({ ...prev, unresolvedErrors: snap.size }));
      }
    );

    // Refresh metrics every 30s while live
    const interval = setInterval(fetchMetrics, 30000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [live, fetchMetrics]);

  const cards = [
    { label: 'Utilizadores', value: metrics.totalUsers },
    { label: 'Bolões', value: metrics.totalPools },
    { label: 'Apostas', value: metrics.totalBets },
    { label: 'Apostas (24h)', value: metrics.bets24h },
    { label: 'Erros por resolver', value: metrics.unresolvedErrors },
  ];

  return (
    <div className="admin__section">
      <h3>Overview</h3>

      <div className="admin__realtime-toggle">
        <span className={`admin__realtime-dot ${live ? '' : 'admin__realtime-dot--off'}`} />
        <span>{live ? 'Tempo real activo' : 'Tempo real pausado'}</span>
        <button
          className="admin__btn admin__btn--ghost admin__btn--small"
          onClick={() => setLive(!live)}
        >
          {live ? 'Parar' : 'Activar'}
        </button>
      </div>

      {loading ? (
        <p className="admin__empty">A carregar métricas...</p>
      ) : (
        <div className="admin__cards">
          {cards.map((c) => (
            <div key={c.label} className="admin__card">
              <span className="admin__card-label">{c.label}</span>
              <span className="admin__card-value">{c.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
