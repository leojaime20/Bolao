import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import schedule from '../data/schedule.json';
import { useAuth } from '../hooks/useAuth';
import { usePools } from '../hooks/usePools';
import { useLanguage } from '../i18n/LanguageContext';

const EMPTY = { champion: '', runnerUp: '', thirdPlace: '' };

export default function PodiumPrediction({ competitionId, competition }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { activePoolId } = usePools();
  const [prediction, setPrediction] = useState(EMPTY);
  const [savedPrediction, setSavedPrediction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const teams = useMemo(
    () => [...schedule.teams].sort((a, b) => t(`team.${a.iso}`).localeCompare(t(`team.${b.iso}`))),
    [t]
  );

  useEffect(() => {
    if (!user || !activePoolId) return undefined;
    let cancelled = false;
    getDoc(doc(db, 'pools', activePoolId, 'competitions', competitionId, 'podiumPredictions', user.uid))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          const data = snap.data();
          const values = {
            champion: data.champion || '',
            runnerUp: data.runnerUp || '',
            thirdPlace: data.thirdPlace || '',
          };
          setPrediction(values);
          setSavedPrediction({ ...values, bonusPoints: data.bonusPoints });
        }
      });
    return () => { cancelled = true; };
  }, [activePoolId, competitionId, user]);

  if (!competition?.podiumPredictionEnabled && !savedPrediction) {
    return (
      <div className="podium">
        <p className="podium__notice">O palpite bonus do podio nao esta habilitado para esta competicao.</p>
      </div>
    );
  }

  const deadline = competition?.podiumPredictionDeadline?.toDate?.();
  const locked = !competition?.podiumPredictionEnabled || !deadline || new Date() >= deadline;

  const handleChange = (key, value) => {
    setPrediction((current) => ({ ...current, [key]: value }));
    setMessage('');
  };

  const handleSave = async () => {
    if (new Set(Object.values(prediction)).size !== 3 || Object.values(prediction).some((value) => !value)) {
      setMessage('Selecione tres equipes diferentes.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const savePrediction = httpsCallable(functions, 'savePodiumPrediction');
      await savePrediction({ poolId: activePoolId, competitionId, ...prediction });
      setSavedPrediction({ ...prediction, bonusPoints: null });
      setMessage('Palpite do podio salvo.');
    } catch (err) {
      console.error('Podium save failed:', err);
      setMessage('Nao foi possivel salvar. Confirme se o prazo ainda esta aberto.');
    }
    setSaving(false);
  };

  const positions = [
    ['champion', 'Campeao', '10 pts'],
    ['runnerUp', 'Vice-campeao', '6 pts'],
    ['thirdPlace', 'Terceiro colocado', '4 pts'],
  ];

  return (
    <div className="podium">
      <div className="podium__heading">
        <h3>Palpite bonus do podio</h3>
        <p>Acertos exatos valem 10, 6 e 4 pontos. Os tres exatos recebem +3.</p>
      </div>
      {deadline && (
        <div className={`podium__status ${locked ? 'podium__status--locked' : ''}`}>
          {locked ? 'Palpites encerrados' : `Aberto ate ${deadline.toLocaleString(t('dateLocale'))}`}
        </div>
      )}
      <div className="podium__fields">
        {positions.map(([key, label, points]) => (
          <label key={key} className="podium__field">
            <span>{label} <strong>{points}</strong></span>
            <select value={prediction[key]} disabled={locked} onChange={(event) => handleChange(key, event.target.value)}>
              <option value="">Selecione</option>
              {teams.map((team) => (
                <option key={team.iso} value={team.iso}>{t(`team.${team.iso}`)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {!locked && (
        <button className="podium__save" disabled={saving} onClick={handleSave}>
          {saving ? t('saving') : 'Salvar palpite do podio'}
        </button>
      )}
      {savedPrediction?.bonusPoints != null && <p className="podium__points">Bonus obtido: {savedPrediction.bonusPoints} pts</p>}
      {message && <p className="podium__message">{message}</p>}
    </div>
  );
}
