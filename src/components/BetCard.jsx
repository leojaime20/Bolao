import { useState, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

function getFlagUrl(iso) {
  return `https://flagcdn.com/w80/${iso}.png`;
}

export default function BetCard({ match, bet, onSave, matchScore, onTeamClick }) {
  const { t } = useLanguage();
  const isPlayable = match.isPlayable ?? !!match.home_iso;
  const hasTeams = isPlayable;
  const isKnockout = !hasTeams;

  const homeName = match.home_iso ? t(`team.${match.home_iso}`) : match.home;
  const awayName = match.away_iso ? t(`team.${match.away_iso}`) : match.away;

  const isFinished = matchScore?.status === 'finished';
  const isLive = matchScore?.status === 'live';
  const kickoffAt = match.kickoffAt?.toDate ? match.kickoffAt.toDate() : null;
  const isStarted = kickoffAt ? new Date() >= kickoffAt : false;
  const isLocked = isFinished || isLive || isStarted;

  const [scoreA, setScoreA] = useState(bet?.predictedScoreA ?? '');
  const [scoreB, setScoreB] = useState(bet?.predictedScoreB ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const debounceRef = useRef(null);

  const dateStr = (() => {
    const date = kickoffAt || new Date(match.date + 'T00:00:00');
    return date.toLocaleDateString(t('dateLocale'), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  })();
  const kickoffStr = kickoffAt
    ? kickoffAt.toLocaleTimeString(t('dateLocale'), { hour: '2-digit', minute: '2-digit' })
    : match.kickoff_bst;

  const handleChange = (side, value) => {
    const num = value === '' ? '' : Math.max(0, parseInt(value) || 0);
    const newA = side === 'home' ? num : scoreA;
    const newB = side === 'away' ? num : scoreB;
    if (side === 'home') setScoreA(num);
    else setScoreB(num);

    clearTimeout(debounceRef.current);
    if (newA !== '' && newB !== '') {
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        setSaved(false);
        setSaveError(false);
        try {
          await onSave(match.id, Number(newA), Number(newB));
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        } catch (err) {
          console.error('Failed to save bet:', err);
          setSaveError(true);
          setTimeout(() => setSaveError(false), 4000);
        }
        setSaving(false);
      }, 800);
    }
  };

  return (
    <div className={`bet-card ${isLive ? 'bet-card--live' : ''} ${isFinished ? 'bet-card--finished' : ''}`}>
      {match.group_label && (
        <span className="match-card__group">{t('group')} {match.group_label}</span>
      )}
      {match.label && isKnockout && (
        <span className="match-card__label">{t(`label.${match.label}`) || match.label}</span>
      )}

      <div className="bet-card__date">
        {dateStr} &middot; {kickoffStr}
        {isLive && <span className="bet-card__live-badge">{t('live')}</span>}
        {saving && <span className="bet-card__status">{t('saving')}</span>}
        {saved && <span className="bet-card__status bet-card__status--saved">✓</span>}
        {saveError && <span className="bet-card__status bet-card__status--error">{t('saveFailed')}</span>}
      </div>

      {match.venue && match.venue !== 'TBD' && (
        <div className="match-card__venue">
          📍 {match.venue} · {match.city}
        </div>
      )}

      <div className="bet-card__teams">
        <div className="bet-card__team" onClick={() => hasTeams && onTeamClick?.(match.home_iso)} style={hasTeams && onTeamClick ? { cursor: 'pointer' } : undefined}>
          {hasTeams ? (
            match.home_crest ? (
              <img src={match.home_crest} alt={homeName} className="match-card__flag match-card__flag--clickable" loading="lazy" />
            ) : (
              <img src={getFlagUrl(match.home_iso)} alt={homeName} className="match-card__flag match-card__flag--clickable" loading="lazy" />
            )
          ) : (
            <div className="match-card__flag-placeholder" />
          )}
          <span className="match-card__name">{homeName}</span>
        </div>

        <div className="bet-card__scores">
          <input
            className="bet-card__input"
            type="number"
            min="0"
            value={scoreA}
            onChange={(e) => handleChange('home', e.target.value)}
            disabled={isLocked || !hasTeams}
            aria-label={`${homeName} ${t('goals')}`}
          />
          <span className="bet-card__separator">:</span>
          <input
            className="bet-card__input"
            type="number"
            min="0"
            value={scoreB}
            onChange={(e) => handleChange('away', e.target.value)}
            disabled={isLocked || !hasTeams}
            aria-label={`${awayName} ${t('goals')}`}
          />
        </div>

        <div className="bet-card__team bet-card__team--away" onClick={() => hasTeams && onTeamClick?.(match.away_iso)} style={hasTeams && onTeamClick ? { cursor: 'pointer' } : undefined}>
          <span className="match-card__name">{awayName}</span>
          {hasTeams ? (
            match.away_crest ? (
              <img src={match.away_crest} alt={awayName} className="match-card__flag match-card__flag--clickable" loading="lazy" />
            ) : (
              <img src={getFlagUrl(match.away_iso)} alt={awayName} className="match-card__flag match-card__flag--clickable" loading="lazy" />
            )
          ) : (
            <div className="match-card__flag-placeholder" />
          )}
        </div>
      </div>

      {isFinished && matchScore?.scoreHome != null && (
        <div className="bet-card__result">
          <span className="bet-card__actual">
            {t('finalResult')}: {matchScore.scoreHome} - {matchScore.scoreAway}
          </span>
          {bet?.pointsAwarded != null && (
            <span className={`bet-card__points bet-card__points--${bet.pointsAwarded}`}>
              +{bet.pointsAwarded} {t('pts')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
