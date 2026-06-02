import { useEffect, useMemo, useState } from 'react';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import schedule from '../../data/schedule.json';

const ACTIONS_URL = 'https://github.com/leojaime20/Bolao/actions/workflows/sync-results.yml';
const DEFAULT_COMPETITIONS = [
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
    podiumPredictionDeadline: Timestamp.fromDate(new Date('2026-06-11T19:00:00Z')),
    sortOrder: 1,
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
        const reference = doc(db, 'competitions', id);
        if (!(await getDoc(reference)).exists()) {
          await setDoc(reference, data);
        }
      }
      setMessage('Competicoes verificadas no Firestore. Configuracoes existentes foram preservadas.');
    } catch (err) {
      console.error(err);
      setMessage('Falha ao configurar competicoes. Publique as regras do Firestore primeiro.');
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
      await updateDoc(doc(db, 'competitions', 'worldcup-2026'), {
        officialPodium: podium,
        officialPodiumAt: serverTimestamp(),
      });
      setMessage('Podio oficial salvo. Execute Atualizar resultados no GitHub para recalcular o bonus.');
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
      <p className="competition-admin__message">
        A coleta e executada manualmente no GitHub Actions.{' '}
        <a href={ACTIONS_URL} target="_blank" rel="noreferrer">Abrir Atualizar resultados</a>
      </p>
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
              <a className="admin__btn admin__btn--primary" href={ACTIONS_URL} target="_blank" rel="noreferrer">
                Atualizar no GitHub
              </a>
            </div>
            <div className="competition-admin__meta">
              <span>Jogos importados: <strong>{competition.lastSyncMatchCount ?? '-'}</strong></span>
              <span>Status: <strong>{competition.lastSyncStatus || 'ainda nao executado'}</strong></span>
              <label className="competition-admin__toggle">
                <input type="checkbox" checked={Boolean(competition.syncEnabled)} onChange={() => handleToggleSync(competition)} />
                Incluir na opcao atualizar todos
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
