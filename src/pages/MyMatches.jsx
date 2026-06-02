import { useState, useMemo, useCallback } from 'react';
import schedule from '../data/schedule.json';
import PhaseFilter from '../components/PhaseFilter';
import MatchCard from '../components/MatchCard';
import { useLanguage } from '../i18n/LanguageContext';
import { downloadMultipleICS } from '../utils/calendar';

export default function MyMatches({ favorites, onNavigate, onTeamClick }) {
  const [activePhase, setActivePhase] = useState('group');
  const { t } = useLanguage();

  const translatedPhases = useMemo(
    () => schedule.phases.map((p) => ({ ...p, name: t(`phase.${p.id}`) })),
    [t]
  );

  const filteredMatches = useMemo(() => {
    if (favorites.length === 0) return [];
    const phase = schedule.phases.find((p) => p.id === activePhase);
    if (!phase) return [];
    return phase.matches.filter(
      (m) =>
        favorites.includes(m.home_iso) || favorites.includes(m.away_iso)
    );
  }, [favorites, activePhase]);

  // All group stage matches for favourites (for bulk export)
  const groupMatches = useMemo(() => {
    if (favorites.length === 0) return [];
    const phase = schedule.phases.find((p) => p.id === 'group');
    if (!phase) return [];
    return phase.matches.filter(
      (m) =>
        favorites.includes(m.home_iso) || favorites.includes(m.away_iso)
    );
  }, [favorites]);

  const handleExportAll = useCallback(() => {
    const events = groupMatches.map((m) => {
      const home = m.home_iso ? t(`team.${m.home_iso}`) : m.home;
      const away = m.away_iso ? t(`team.${m.away_iso}`) : m.away;
      return {
        title: `${home} vs ${away}`,
        date: m.date,
        kickoff: m.kickoff_bst,
      };
    });
    downloadMultipleICS(events, 'Copa_2026_Jogos.ics');
  }, [groupMatches, t]);

  if (favorites.length === 0) {
    return (
      <div className="my-matches__empty">
        <span className="my-matches__empty-icon">⭐</span>
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyDescription')}</p>
        <button
          className="my-matches__empty-cta"
          onClick={() => onNavigate('teams')}
        >
          {t('emptyCta')}
        </button>
      </div>
    );
  }

  const matchesByDate = {};
  for (const match of filteredMatches) {
    if (!matchesByDate[match.date]) matchesByDate[match.date] = [];
    matchesByDate[match.date].push(match);
  }

  return (
    <div className="my-matches">
      <PhaseFilter
        phases={translatedPhases}
        active={activePhase}
        onSelect={setActivePhase}
      />

      {filteredMatches.length === 0 ? (
        <div className="my-matches__no-results">
          <p>{t('noMatchesInPhase')}</p>
        </div>
      ) : (
        <div className="schedule__list">
          {Object.entries(matchesByDate).map(([date, matches]) => {
            const d = new Date(date + 'T00:00:00');
            const label = d.toLocaleDateString(t('dateLocale'), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            });
            return (
              <div key={date} className="schedule__day">
                <h3 className="schedule__day-label">{label}</h3>
                {matches.map((match, i) => (
                  <MatchCard key={match.id} match={match} onTeamClick={onTeamClick} index={i} />
                ))}
              </div>
            );
          })}

          {groupMatches.length > 0 && (
            <div className="my-matches__export">
              <button className="my-matches__export-btn" onClick={handleExportAll}>
                📅 {t('exportShort')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
