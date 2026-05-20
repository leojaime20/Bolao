import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations } from './translations';

const LanguageContext = createContext();

const STORAGE_KEY = 'Copa-Yantai-lang';

function getInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && translations[saved]) return saved;
  } catch {}
  // Default based on browser language
  const browserLang = navigator.language || '';
  if (browserLang.startsWith('pt')) return 'pt-PT';
  return 'en-GB';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  const setLang = useCallback((newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'pt-PT' ? 'pt' : 'en';
  }, [lang]);

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations['pt-PT']?.[key] ?? key,
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
