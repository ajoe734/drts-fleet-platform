"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type Locale, t as translate, translations } from "./translations";

const COOKIE_KEY = "drts-locale-v2";
const STORAGE_KEY = "drts-locale-v2";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "zh",
  setLocale: () => {},
});

export function LanguageProvider({
  children,
  defaultLocale = "zh",
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && stored in translations) {
      setLocaleState(stored);
    } else {
      setLocaleState(defaultLocale);
    }
  }, [defaultLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${COOKIE_KEY}=${next};path=/;max-age=31536000;SameSite=Lax`;
    window.location.reload();
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const { locale, setLocale } = useContext(LanguageContext);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      translate(key, locale, params),
    [locale],
  );

  return useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
}
