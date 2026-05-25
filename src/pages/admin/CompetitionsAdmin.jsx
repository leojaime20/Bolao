import { useEffect, useMemo, useState } from 'react';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import schedule from '../../data/schedule.json';

const DEFAULT_COMPETITIONS = [
  {
    id: 'libertadores-test',
    name: 'Libertadores 2026 - Teste',
    apiProvider: 'football-data',
    apiCode: 'CLI',
    season: 2026,
    enabled: true,
    syncEnabled: true,
    isTest: true,
    podiumPredictionEnabled: false,
    sortOrder: 1,
  },
  {
    id: 'worldcup-2026',
    name: 'Copa do Mundo 2026',
    apiProvider: 'football-data',
    apiCode: 'WC',
    season: 2026,
    enabled: true,
    syncEnabled: true,
    isTest: false,
    podiumPredictionEnabled: true,
    podiumPredictionLocked: false,
    podiumPredictionFinalEnabled: null,
    podiumPredictionDeadline: Timestamp.fromDate(new Date('2026-06-11T19:00:00Z')),
    sortOrder: 2,
  },
];

export default function CompetitionsAdmin() {
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [podium, setPodium] = useState({ champion: '', runnerUp: '', thirdPlace: '' });
  const teams = useMemo(() => [...schedule.teams].sort((a, b) => a.name.localeCompare(b.name)), []);

  useEffect(() => onSnapshot(collection(db, 'competitions'), (snap) => {
    const result = snap.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    setCompetitions(result);
    const worldCup = result.find((competition) => competition.id === 'worldcup-2026');
    if (worldCup?.officialPodium) setPodium(worldCup.officialPodium);
    setLoading(false);
  }), []);

  const handleInitialize = async () => {
    setWorking('initialize');
    setMessage('');
    try {
      for (const competition of DEFAULT_COMPETITIONS) {
        const { id, ...data } = competition;
        await setDoc(doc(db, 'competitions', id), data, { merge: true });
      }
      setMessage('Competicoes configuradas no Firestore.');
    } catch (err) {
      console.error(err);
      setMessage('Falha ao configurar competicoes. Publique as regras do Firestore primeiro.');
    }
    setWorking('');
  };

  const handleSync = async (competitionId) => {
    setWorking(`sync-${competitionId}`);
    setMessage('');
    try {
      const syncCompetitionNow = httpsCallable(functions, 'syncCompetitionNow');
      const result = await syncCompetitionNow({ competitionId });
      setMessage(`${result.data.importedMatches} jogos importados; ${result.data.scoredBets} palpites atualizados.`);
    } catch (err) {
      console.error(err);
      setMessage('Sincronizacao falhou. Configure o secret e publique as Firebase Functions.');
    }
    setWorking('');
  };

  const handleToggleSync = async (competition) => {
    await updateDoc(doc(db, 'competitions', competition.id), {
      syncEnabled: !competition.syncEnabled,
    });
  };

  const handleTogglePodium = async (competition) => {
    const deadline = competition.podiumPredictionDeadline?.toDate?.();
    if (deadline && new Date() >= deadline) {
      setMessage('O bonus nao pode ser alterado depois do inicio da Copa.');
      return;
    }
    await updateDoc(doc(db, 'competitions', competition.id), {
      podiumPredictionEnabled: !competition.podiumPredictionEnabled,
    });
  };

  const handleOfficialPodium = async () => {
    if (new Set(Object.values(podium)).size !== 3 || Object.values(podium).some((value) => !value)) {
      setMessage('Selecione tres equipes diferentes para o podio oficial.');
      return;
    }
    setWorking('podium');
    try {
      const setOfficialPodium = httpsCallable(functions, 'setOfficialPodium');
      await setOfficialPodium({ competitionId: 'worldcup-2026', ...podium });
      setMessage('Podio oficial salvo e bonus reprocessado.');
    } catch (err) {
      console.error(err);
      setMessage('Falha ao salvar podio oficial.');
    }
    setWorking('');
  };

  if (loading) return <div className="admin__section"><p className="admin__empty">A carregar...</p></div>;

  return (
    <div className="admin__section competition-admin">
      <div className="competition-admin__title">
        <h3>Competicoes e sincronizacao</h3>
        <button className="admin__btn admin__btn--ghost" onClick={handleInitialize} disabled={working === 'initialize'}>
          {working === 'initialize' ? '...' : 'Configurar padroes'}
        </button>
      </div>
      {message && <p className="competition-admin__message">{message}</p>}
      {competitions.length === 0 ? (
        <p className="admin__empty">Nenhuma competicao configurada. Clique em Configurar padroes.</p>
      ) : competitions.map((competition) => {
        const deadline = competition.podiumPredictionDeadline?.toDate?.();
        const podiumLocked = deadline ? new Date() >= deadline : false;
        return (
          <section key={competition.id} className="competition-admin__card">
            <div className="competition-admin__row">
              <div>
                <h4>{competition.name}</h4>
                <p>{competition.id} / API: {competition.apiCode}</p>
              </div>
              <button className="admin__btn admin__btn--primary" onClick={() => handleSync(competition.id)} disabled={working === `sync-${competition.id}`}>
                {working === `sync-${competition.id}` ? 'Sincronizando...' : 'Sincronizar agora'}
              </button>
            </div>
            <div className="competition-admin__meta">
              <span>Jogos importados: <strong>{competition.lastSyncMatchCount ?? '-'}</strong></span>
              <span>Status: <strong>{competition.lastSyncStatus || 'ainda nao executado'}</strong></span>
              <label className="competition-admin__toggle">
                <input type="checkbox" checked={Boolean(competition.syncEnabled)} onChange={() => handleToggleSync(competition)} />
                Sync automatico
              </label>
            </div>
            {competition.id === 'worldcup-2026' && (
              <div className="competition-admin__podium">
                <div className="competition-admin__meta">
                  <label className="competition-admin__toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(competition.podiumPredictionEnabled)}
                      onChange={() => handleTogglePodium(competition)}
                      disabled={podiumLocked}
                    />
                    Bonus do podio ativo
                  </label>
                  <span>Prazo: <strong>{deadline?.toLocaleString('pt-BR') || '-'}</strong></span>
                  <span>{podiumLocked ? 'Configuracao bloqueada' : 'Configuracao editavel'}</span>
                </div>
                <h5>Podio oficial para apuracao final</h5>
                <div className="competition-admin__selects">
                  {[
                    ['champion', 'Campeao'],
                    ['runnerUp', 'Vice-campeao'],
                    ['thirdPlace', 'Terceiro'],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <select value={podium[key] || ''} onChange={(event) => setPodium((value) => ({ ...value, [key]: event.target.value }))}>
                        <option value="">Selecione</option>
                        {teams.map((team) => <option key={team.iso} value={team.iso}>{team.name}</option>)}
                      </select>
                    </label>
                  ))}
                  <button className="admin__btn admin__btn--primary" onClick={handleOfficialPodium} disabled={working === 'podium'}>
                    Salvar podio oficial
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
