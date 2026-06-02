import { useLanguage } from '../i18n/LanguageContext';

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <button
      className="lang-switcher"
      onClick={() => setLang(lang === 'pt-BR' ? 'en-GB' : 'pt-BR')}
      aria-label="Switch language"
    >
      {lang === 'pt-BR' ? '🇬🇧' : '🇧🇷'}
    </button>
  );
}
