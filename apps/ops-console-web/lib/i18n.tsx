"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { type Locale, t as translate, translations } from "./translations";

const COOKIE_KEY = "drts-locale-v2";
const STORAGE_KEY = "drts-locale-v2";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// i18n remediation 20260604 §5: default locale is zh on both server and
// client. The createContext fallback and LanguageProvider default must align
// with getServerLocale() (which defaults to zh) to avoid an en->zh flash for
// any consumer that renders outside the provider during hydration.
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
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && stored in translations) {
      setLocaleState(stored);
    } else {
      setLocaleState(defaultLocale);
    }
  }, [defaultLocale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${COOKIE_KEY}=${next};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const { locale, setLocale } = useContext(LanguageContext);

  // Memoize `t` on `locale` so its identity is stable across renders, keeping it
  // safe to list as a useCallback/useMemo/useEffect dependency without causing
  // refetch loops (see platform-admin users page 429 storm).
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      translate(key, locale, params),
    [locale],
  );

  return { locale, setLocale, t };
}
