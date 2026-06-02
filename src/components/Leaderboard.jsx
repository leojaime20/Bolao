import { useState, useEffect } from 'react';
import { getDocs } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { usePools } from '../hooks/usePools';
import { poolSubcollection } from '../hooks/useBets';
import { useLanguage } from '../i18n/LanguageContext';

export default function Leaderboard({ competitionId = null }) {
  const { user } = useAuth();
  const { activePoolId } = usePools();
  const { t } = useLanguage();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activePoolId) return;
    let cancelled = false;
    (async () => {
      const snap = await getDocs(poolSubcollection(activePoolId, competitionId, 'leaderboard'));
      if (cancelled) return;
      const list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          return 0;
        });
      setEntries(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activePoolId, competitionId]);

  if (loading) {
    return <div className="leaderboard__loading">{t('loading')}</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="leaderboard__empty">
        <span className="leaderboard__empty-icon">🏅</span>
        <p>{t('leaderboardEmpty')}</p>
      </div>
    );
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="leaderboard">
      <div className="leaderboard__header">
        <span className="leaderboard__col leaderboard__col--pos">#</span>
        <span className="leaderboard__col leaderboard__col--name">{t('player')}</span>
        <span className="leaderboard__col leaderboard__col--score">Jogos</span>
        <span className="leaderboard__col leaderboard__col--score">Bônus</span>
        <span className="leaderboard__col leaderboard__col--pts">Total</span>
      </div>

      {entries.map((entry, i) => {
        const isMe = entry.uid === user?.uid;
        return (
          <div
            key={entry.uid}
            className={`leaderboard__row ${isMe ? 'leaderboard__row--me' : ''} ${i < 3 ? 'leaderboard__row--top' : ''}`}
          >
            <span className="leaderboard__col leaderboard__col--pos">
              {i < 3 ? medals[i] : i + 1}
            </span>
            <span className="leaderboard__col leaderboard__col--name">
              <span className="leaderboard__avatar">{entry.nickname?.charAt(0).toUpperCase()}</span>
              {entry.nickname}
              {isMe && <span className="leaderboard__me-badge">{t('you')}</span>}
            </span>
            <span className="leaderboard__col leaderboard__col--score">
              {entry.matchPoints ?? entry.totalPoints ?? 0}
            </span>
            <span className="leaderboard__col leaderboard__col--score">
              {entry.bonusPoints || 0}
            </span>
            <span className="leaderboard__col leaderboard__col--pts">
              {entry.totalPoints || 0}
            </span>
          </div>
        );
      })}
    </div>
  );
}
