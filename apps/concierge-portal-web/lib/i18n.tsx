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
import { CONCIERGE_LOCALE_COOKIE } from "./locale-config";
import {
  getLocaleHtmlLang,
  type Locale,
  t as translate,
  translations,
} from "./translations";

type LanguageContextValue = {
  locale: Locale;
  ready: boolean;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "zh",
  ready: false,
  setLocale: () => {},
});

function setDocumentLang(locale: Locale) {
  document.documentElement.lang = getLocaleHtmlLang(locale);
}

export function LanguageProvider({
  children,
  defaultLocale = "zh",
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(
      CONCIERGE_LOCALE_COOKIE,
    ) as Locale | null;
    if (stored && stored in translations) {
      setLocaleState(stored);
      setDocumentLang(stored);
      setReady(true);
      return;
    }
    setLocaleState(defaultLocale);
    setDocumentLang(defaultLocale);
    setReady(true);
  }, [defaultLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(CONCIERGE_LOCALE_COOKIE, next);
    document.cookie =
      CONCIERGE_LOCALE_COOKIE +
      "=" +
      next +
      ";path=/;max-age=31536000;SameSite=Lax";
    setDocumentLang(next);
  }, []);

  const value = useMemo(
    () => ({ locale, ready, setLocale }),
    [locale, ready, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const { locale, ready, setLocale } = useContext(LanguageContext);
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(key, locale, params),
    [locale],
  );

  return useMemo(
    () => ({ locale, ready, setLocale, t }),
    [locale, ready, setLocale, t],
  );
}
