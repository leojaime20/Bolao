import { useState } from 'react';
import Overview from './admin/Overview';
import PoolsAdmin from './admin/PoolsAdmin';
import UsersAdmin from './admin/UsersAdmin';
import ScoresAdmin from './admin/ScoresAdmin';
import ErrorLogs from './admin/ErrorLogs';
import CompetitionsAdmin from './admin/CompetitionsAdmin';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'pools', label: 'Bolões', icon: '🎱' },
  { id: 'users', label: 'Utilizadores', icon: '👥' },
  { id: 'scores', label: 'Resultados antigos', icon: '⚽' },
  { id: 'competitions', label: 'Competições', icon: '🏆' },
  { id: 'logs', label: 'Error Logs', icon: '🐛' },
];

export default function Admin() {
  const [section, setSection] = useState('overview');

  return (
    <div className="admin">
      <nav className="admin__sidebar">
        <h2 className="admin__sidebar-title">Admin</h2>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`admin__sidebar-item ${section === s.id ? 'admin__sidebar-item--active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </nav>
      <div className="admin__content">
        {section === 'overview' && <Overview />}
        {section === 'pools' && <PoolsAdmin />}
        {section === 'users' && <UsersAdmin />}
        {section === 'scores' && <ScoresAdmin />}
        {section === 'competitions' && <CompetitionsAdmin />}
        {section === 'logs' && <ErrorLogs />}
      </div>
    </div>
  );
}
