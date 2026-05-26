import { useLanguage } from '../i18n/LanguageContext';

export default function Rules() {
  const { t } = useLanguage();

  return (
    <div className="rules">
      <div className="rules__header">
        <span className="rules__icon">📋</span>
        <h2 className="rules__title">{t('rulesTitle')}</h2>
      </div>

      <section className="rules__section">
        <h3 className="rules__section-title">{t('rulesHowItWorks')}</h3>
        <ul className="rules__list">
          <li>{t('rulesHow1')}</li>
          <li>{t('rulesHow2')}</li>
          <li>{t('rulesHow3')}</li>
        </ul>
      </section>

      <section className="rules__section">
        <h3 className="rules__section-title">{t('rulesScoring')}</h3>
        <p className="rules__callout">{t('rulesNonCumulative')}</p>
        <div className="rules__points">
          <div className="rules__point-row">
            <span className="rules__point-badge rules__point-badge--5">5 {t('pts')}</span>
            <span>{t('rulesExact')}</span>
          </div>
          <div className="rules__point-row">
            <span className="rules__point-badge rules__point-badge--3">3 {t('pts')}</span>
            <span>{t('rulesOutcome')}</span>
          </div>
          <div className="rules__point-row">
            <span className="rules__point-badge rules__point-badge--1">1 {t('pts')}</span>
            <span>{t('rulesPartial')}</span>
          </div>
          <div className="rules__point-row">
            <span className="rules__point-badge rules__point-badge--0">0 {t('pts')}</span>
            <span>{t('rulesMiss')}</span>
          </div>
        </div>
      </section>

      <section className="rules__section">
        <h3 className="rules__section-title">{t('rulesPodium')}</h3>
        <p className="rules__callout">{t('rulesPodiumAvailability')}</p>
        <ul className="rules__list">
          <li>{t('rulesPodiumHow')}</li>
          <li>{t('rulesPodiumExact')}</li>
          <li>{t('rulesPodiumPartial')}</li>
          <li>{t('rulesPodiumPerfect')}</li>
          <li>{t('rulesPodiumOfficial')}</li>
        </ul>
      </section>

      <section className="rules__section">
        <h3 className="rules__section-title">{t('rulesExamples')}</h3>
        <div className="rules__example">
          <div className="rules__example-header">{t('rulesExResult')}: 2 - 1</div>
          <div className="rules__example-row">
            <span>{t('rulesBet')}: 2 - 1</span>
            <span className="rules__point-badge rules__point-badge--5">5 {t('pts')}</span>
          </div>
          <div className="rules__example-row">
            <span>{t('rulesBet')}: 1 - 0</span>
            <span className="rules__point-badge rules__point-badge--3">3 {t('pts')}</span>
          </div>
          <div className="rules__example-row">
            <span>{t('rulesBet')}: 2 - 3</span>
            <span className="rules__point-badge rules__point-badge--1">1 {t('pts')}</span>
          </div>
          <div className="rules__example-row">
            <span>{t('rulesBet')}: 0 - 0</span>
            <span className="rules__point-badge rules__point-badge--0">0 {t('pts')}</span>
          </div>
        </div>
      </section>

      <section className="rules__section">
        <h3 className="rules__section-title">{t('rulesRanking')}</h3>
        <ul className="rules__list">
          <li>{t('rulesRanking1')}</li>
          <li>{t('rulesRanking2')}</li>
        </ul>
      </section>

      <section className="rules__section">
        <h3 className="rules__section-title">{t('rulesTiebreak')}</h3>
        <ol className="rules__list rules__list--ordered">
          <li>{t('rulesTie1')}</li>
          <li>{t('rulesTie2')}</li>
          <li>{t('rulesTie3')}</li>
        </ol>
      </section>
    </div>
  );
}
