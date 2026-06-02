import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

export function useCompetition(competitionId) {
  const [competition, setCompetition] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!competitionId) return undefined;
    const unsubCompetition = onSnapshot(
      doc(db, 'competitions', competitionId),
      (snap) => {
        setCompetition(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setError('');
      },
      () => setError('Não foi possível carregar a competição.')
    );
    const unsubMatches = onSnapshot(
      query(collection(db, 'competitions', competitionId, 'matches'), orderBy('kickoffAt')),
      (snap) => {
        setMatches(snap.docs.map((match) => ({ id: match.id, ...match.data() })));
        setError('');
        setLoading(false);
      },
      () => {
        setError('Não foi possível carregar os jogos.');
        setLoading(false);
      }
    );
    return () => {
      unsubCompetition();
      unsubMatches();
    };
  }, [competitionId]);

  return { competition, matches, loading, error };
}
