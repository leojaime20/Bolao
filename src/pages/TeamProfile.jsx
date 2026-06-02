import { useMemo } from 'react';
import schedule from '../data/schedule.json';
import { useLanguage } from '../i18n/LanguageContext';

const teamModules = import.meta.glob('../data/teams/*.js', { eager: true });

function getTeamData(iso) {
  const key = `../data/teams/${iso}.js`;
  return teamModules[key]?.default || null;
}

function getFlagUrl(iso) {
  return `https://flagcdn.com/w160/${iso}.png`;
}

// Resolve bilingual fields: { pt: '...', en: '...' } or plain string
function loc(value, lang) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const key = lang === 'pt-BR' ? 'pt' : 'en';
  return value[key] ?? value.pt ?? value.en ?? '';
}

function getTeamMatches(iso) {
  const matches = [];
  for (const phase of schedule.phases) {
    for (const m of phase.matches) {
      if (m.home_iso === iso || m.away_iso === iso) {
        matches.push({ ...m, phase: phase.id });
      }
    }
  }
  return matches;
}

function getTeamInfo(iso) {
  const team = schedule.teams.find((t) => t.iso === iso);
  return team || null;
}

export default function TeamProfile({ iso, onBack, onTeamClick }) {
  const { t, lang } = useLanguage();
  const data = getTeamData(iso);
  const teamInfo = getTeamInfo(iso);
  const matches = useMemo(() => getTeamMatches(iso), [iso]);
  const teamName = t(`team.${iso}`);

  if (!teamInfo) {
    return (
      <div className="team-profile">
        <button className="team-profile__back" onClick={onBack}>← {t('back')}</button>
        <p>{t('teamNotFound')}</p>
      </div>
    );
  }

  // Fallback — no editorial data
  if (!data) {
    return (
      <div className="team-profile">
        <button className="team-profile__back" onClick={onBack}>← {t('back')}</button>
        <div className="team-profile__hero">
          <img src={getFlagUrl(iso)} alt={teamName} className="team-profile__hero-flag" />
          <h1 className="team-profile__hero-name">{teamName}</h1>
          <span className="team-profile__hero-group">{t('group')} {teamInfo.group}</span>
        </div>
        {matches.length > 0 && (
          <section className="team-profile__section">
            <h3 className="team-profile__section-title">{t('teamMatches')}</h3>
            <div className="team-profile__matches">
              {matches.map((m) => {
                const homeName = m.home_iso ? t(`team.${m.home_iso}`) : m.home;
                const awayName = m.away_iso ? t(`team.${m.away_iso}`) : m.away;
                const d = new Date(m.date + 'T00:00:00');
                const dateStr = d.toLocaleDateString(t('dateLocale'), { day: 'numeric', month: 'short' });
                return (
                  <div key={m.id} className="team-profile__match-row">
                    <span className="team-profile__match-date">{dateStr} · {m.kickoff_bst}</span>
                    <span className="team-profile__match-teams">{homeName} vs {awayName}</span>
                    {m.venue && <span className="team-profile__match-venue">📍 {m.city}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  // Full editorial page
  const positionLabels = {
    goalkeepers: t('posGK'),
    defenders: t('posDEF'),
    midfielders: t('posMID'),
    forwards: t('posFWD'),
  };

  return (
    <div className="team-profile">
      <button className="team-profile__back" onClick={onBack}>← {t('back')}</button>

      {/* Hero */}
      <div className="team-profile__hero">
        <div className="team-profile__hero-bg" style={{
          backgroundImage: `url(https://flagcdn.com/w640/${iso}.png)`,
        }} />
        <div className="team-profile__hero-overlay" style={{
          background: `linear-gradient(180deg, ${data.colors[0]}CC 0%, ${data.colors[1]}AA 100%)`,
        }} />
        <div className="team-profile__hero-content">
          <img src={getFlagUrl(iso)} alt={teamName} className="team-profile__hero-flag" />
          <h1 className="team-profile__hero-name">{teamName}</h1>
          <span className="team-profile__hero-group">{t('group')} {teamInfo.group}</span>
          <span className="team-profile__hero-coach">{t('coach')}: {data.coach}</span>
        </div>
      </div>

      {/* Quick stats */}
      <section className="team-profile__stats">
        <div className="team-profile__stat">
          <span className="team-profile__stat-value">{data.worldCupAppearances}</span>
          <span className="team-profile__stat-label">{t('statAppearances')}</span>
        </div>
        <div className="team-profile__stat">
          <span className="team-profile__stat-value">{loc(data.bestResult, lang)}</span>
          <span className="team-profile__stat-label">{t('statBestResult')}</span>
        </div>
        <div className="team-profile__stat">
          <span className="team-profile__stat-value">{data.worldCupGoals}</span>
          <span className="team-profile__stat-label">{t('statGoals')}</span>
        </div>
        <div className="team-profile__stat">
          <span className="team-profile__stat-value">{data.internationalTitles.length}</span>
          <span className="team-profile__stat-label">{t('statTitles')}</span>
        </div>
      </section>

      {/* Titles */}
      {data.internationalTitles.length > 0 && (
        <section className="team-profile__section">
          <h3 className="team-profile__section-title">🏆 {t('teamTitles')}</h3>
          <div className="team-profile__titles">
            {data.internationalTitles.map((title) => (
              <span key={title} className="team-profile__title-badge">{title}</span>
            ))}
          </div>
        </section>
      )}

      {/* Squad */}
      <section className="team-profile__section">
        <h3 className="team-profile__section-title">👥 {t('teamSquad')}</h3>
        <p className="team-profile__squad-note">{t('squadDisclaimer')}</p>
        {Object.entries(data.probableSquad).map(([pos, players]) => (
          <div key={pos} className="team-profile__squad-group">
            <h4 className="team-profile__squad-pos">{positionLabels[pos]}</h4>
            {players.map((p) => (
              <div key={p.name} className="team-profile__player">
                <span className="team-profile__player-name">{p.name}</span>
                <span className="team-profile__player-club">{p.club}</span>
                {p.caps > 0 && <span className="team-profile__player-caps">{p.caps} {t('caps')}</span>}
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Qualification */}
      <section className="team-profile__section">
        <h3 className="team-profile__section-title">📊 {t('teamQualification')}</h3>
        <div className="team-profile__qual-grid">
          <div className="team-profile__qual-item">
            <span className="team-profile__qual-label">{t('qualTopScorer')}</span>
            <span className="team-profile__qual-value">{loc(data.qualification2026.topScorer, lang)}</span>
          </div>
          <div className="team-profile__qual-item">
            <span className="team-profile__qual-label">{t('qualAssists')}</span>
            <span className="team-profile__qual-value">{loc(data.qualification2026.topAssists, lang)}</span>
          </div>
          <div className="team-profile__qual-item">
            <span className="team-profile__qual-label">{t('qualMostUsed')}</span>
            <span className="team-profile__qual-value">{loc(data.qualification2026.mostUsed, lang)}</span>
          </div>
          <div className="team-profile__qual-item">
            <span className="team-profile__qual-label">{t('qualChances')}</span>
            <span className="team-profile__qual-value">{loc(data.qualification2026.chancesCreated, lang)}</span>
          </div>
        </div>
        <p className="team-profile__qual-note">{loc(data.qualification2026.note, lang)}</p>
      </section>

      {/* Fun Facts */}
      <section className="team-profile__section">
        <h3 className="team-profile__section-title">💡 {t('teamFunFacts')}</h3>
        <div className="team-profile__facts">
          {data.funFacts.map((fact, i) => (
            <div key={i} className="team-profile__fact">
              <span className="team-profile__fact-emoji">{fact.emoji}</span>
              <span className="team-profile__fact-text">{loc(fact.text || fact, lang)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="team-profile__section">
        <h3 className="team-profile__section-title">📅 {t('teamTimeline')}</h3>
        <div className="team-profile__timeline">
          {data.timeline.map((item) => (
            <div key={item.year} className="team-profile__tl-item">
              <span className="team-profile__tl-year">{item.year}</span>
              <div className="team-profile__tl-dot" />
              <span className="team-profile__tl-text">{loc(item.text || item, lang)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Matches in WC2026 */}
      {matches.length > 0 && (
        <section className="team-profile__section">
          <h3 className="team-profile__section-title">🏟️ {t('teamMatches')}</h3>
          <div className="team-profile__matches">
            {matches.map((m) => {
              const homeName = m.home_iso ? t(`team.${m.home_iso}`) : m.home;
              const awayName = m.away_iso ? t(`team.${m.away_iso}`) : m.away;
              const d = new Date(m.date + 'T00:00:00');
              const dateStr = d.toLocaleDateString(t('dateLocale'), { day: 'numeric', month: 'short' });
              const opponentIso = m.home_iso === iso ? m.away_iso : m.home_iso;
              return (
                <button
                  key={m.id}
                  className="team-profile__match-row"
                  onClick={() => opponentIso && onTeamClick(opponentIso)}
                >
                  <span className="team-profile__match-date">{dateStr} · {m.kickoff_bst}</span>
                  <span className="team-profile__match-teams">
                    {homeName} <span className="team-profile__match-vs">vs</span> {awayName}
                  </span>
                  {m.venue && <span className="team-profile__match-venue">📍 {m.venue} · {m.city}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Sources */}
      <footer className="team-profile__sources">
        {t('sources')}: {data.sources.map((s, i) => (
          <span key={s.name}>
            {i > 0 && ', '}
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
          </span>
        ))}
      </footer>
    </div>
  );
}
