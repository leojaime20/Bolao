import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations } from './translations';

const LanguageContext = createContext();

const STORAGE_KEY = 'Copa-Yantai-lang';

function normalizeLang(value) {
  if (value === 'pt-PT' || value === 'pt' || value === 'pt_BR') return 'pt-BR';
  if (value && translations[value]) return value;
  return 'pt-BR';
}

function getInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeLang(saved);
  } catch {}
  // Default based on browser language
  const browserLang = navigator.language || '';
  if (browserLang.startsWith('pt')) return 'pt-BR';
  return 'en-GB';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  const setLang = useCallback((newLang) => {
    const normalizedLang = normalizeLang(newLang);
    setLangState(normalizedLang);
    try {
      localStorage.setItem(STORAGE_KEY, normalizedLang);
    } catch {}
  }, []);

  useEffect(() => {
    const normalizedLang = normalizeLang(lang);
    if (normalizedLang !== lang) {
      setLang(normalizedLang);
      return;
    }
    document.documentElement.lang = normalizedLang === 'pt-BR' ? 'pt-BR' : 'en';
  }, [lang, setLang]);

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations['pt-BR']?.[key] ?? key,
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
