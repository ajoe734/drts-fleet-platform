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
import { PARTNER_LOCALE_COOKIE } from "./locale-config";
import { type Locale, t as translate, translations } from "./translations";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

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
    const requestedLocale = new URLSearchParams(window.location.search).get(
      "locale",
    ) as Locale | null;
    if (requestedLocale && requestedLocale in translations) {
      localStorage.setItem(PARTNER_LOCALE_COOKIE, requestedLocale);
      document.cookie = `${PARTNER_LOCALE_COOKIE}=${requestedLocale};path=/;max-age=31536000;SameSite=Lax`;
      setLocaleState(requestedLocale);
      return;
    }

    const stored = localStorage.getItem(PARTNER_LOCALE_COOKIE) as Locale | null;
    if (stored && stored in translations) {
      setLocaleState(stored);
      return;
    }
    setLocaleState(defaultLocale);
  }, [defaultLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState((current) => {
      if (current === next) {
        return current;
      }

      localStorage.setItem(PARTNER_LOCALE_COOKIE, next);
      document.cookie = `${PARTNER_LOCALE_COOKIE}=${next};path=/;max-age=31536000;SameSite=Lax`;

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("locale", next);
      window.location.assign(
        `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
      );
      return next;
    });
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
    (key: string, params?: Record<string, string | number>) =>
      translate(key, params, locale),
    [locale],
  );

  return useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
}
