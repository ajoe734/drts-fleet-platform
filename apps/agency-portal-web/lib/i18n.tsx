"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AGENCY_LOCALE_COOKIE } from "./locale-config";
import {
  type Locale,
  type TranslationKey,
  isLocale,
  normalizeLocale,
  t as translate,
} from "./translations";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  hasProvider: boolean;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "zh",
  setLocale: () => {},
  hasProvider: false,
});

export function toHtmlLang(locale: Locale): "zh-Hant" | "en" {
  return locale === "zh" ? "zh-Hant" : "en";
}

function setDocumentLang(locale: Locale) {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = toHtmlLang(locale);
  }
}

function readCookieLocale(): Locale | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AGENCY_LOCALE_COOKIE}=`));
  if (!match) {
    return null;
  }
  const raw = decodeURIComponent(match.slice(AGENCY_LOCALE_COOKIE.length + 1));
  return isLocale(raw) ? raw : null;
}

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  const stored = window.localStorage.getItem(AGENCY_LOCALE_COOKIE);
  return isLocale(stored) ? stored : null;
}

export function LanguageProvider({
  children,
  defaultLocale,
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const initialLocale = normalizeLocale(defaultLocale ?? "zh");
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  let router: ReturnType<typeof useRouter> | null = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }

  useEffect(() => {
    if (defaultLocale !== undefined) {
      const normalized = normalizeLocale(defaultLocale);
      setLocaleState(normalized);
      setDocumentLang(normalized);
      return;
    }
    const persisted = readCookieLocale() ?? readStoredLocale() ?? "zh";
    setLocaleState(persisted);
    setDocumentLang(persisted);
  }, [defaultLocale]);

  const setLocale = useCallback(
    (next: Locale) => {
      const target = normalizeLocale(next);
      setLocaleState((current) => {
        if (current === target) {
          return current;
        }

        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(AGENCY_LOCALE_COOKIE, target);
        }
        if (typeof document !== "undefined") {
          document.cookie = `${AGENCY_LOCALE_COOKIE}=${target};path=/;max-age=31536000;SameSite=Lax`;
        }
        setDocumentLang(target);
        if (router) {
          startTransition(() => {
            router.refresh();
          });
        }
        return target;
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({ locale, setLocale, hasProvider: true }),
    [locale, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(explicitLocale?: Locale) {
  const { locale: contextLocale, setLocale, hasProvider } =
    useContext(LanguageContext);
  const effectiveLocale = hasProvider
    ? contextLocale
    : normalizeLocale(explicitLocale ?? contextLocale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(key, params, effectiveLocale),
    [effectiveLocale],
  );

  return useMemo(
    () => ({ locale: effectiveLocale, setLocale, t }),
    [effectiveLocale, setLocale, t],
  );
}
