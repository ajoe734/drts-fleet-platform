"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ManagementDensity, ManagementMode } from "./management-theme";

export interface ManagementThemeContextValue {
  density: ManagementDensity;
  dark: boolean;
  mode: ManagementMode;
  setDensity: (density: ManagementDensity) => void;
  setDark: (dark: boolean) => void;
  setMode: (mode: ManagementMode) => void;
  toggleDark: () => void;
}

export interface ManagementThemeProviderProps {
  children: ReactNode;
  density?: ManagementDensity;
  defaultDensity?: ManagementDensity;
  dark?: boolean;
  defaultDark?: boolean;
  onDensityChange?: (density: ManagementDensity) => void;
  onDarkChange?: (dark: boolean) => void;
}

const DEFAULT_DENSITY: ManagementDensity = "comfortable";
const DEFAULT_DARK = false;

const ManagementThemeContext =
  createContext<ManagementThemeContextValue | null>(null);

function useControllableDensity(
  value: ManagementDensity | undefined,
  defaultValue: ManagementDensity,
  onChange: ((density: ManagementDensity) => void) | undefined,
) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const resolvedValue = value ?? internalValue;

  const setValue = (nextValue: ManagementDensity) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  };

  return [resolvedValue, setValue] as const;
}

function useControllableDark(
  value: boolean | undefined,
  defaultValue: boolean,
  onChange: ((dark: boolean) => void) | undefined,
) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const resolvedValue = value ?? internalValue;

  const setValue = (nextValue: boolean) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  };

  return [resolvedValue, setValue] as const;
}

export function ManagementThemeProvider({
  children,
  density,
  defaultDensity = DEFAULT_DENSITY,
  dark,
  defaultDark = DEFAULT_DARK,
  onDensityChange,
  onDarkChange,
}: ManagementThemeProviderProps) {
  const [resolvedDensity, setDensity] = useControllableDensity(
    density,
    defaultDensity,
    onDensityChange,
  );
  const [resolvedDark, setDark] = useControllableDark(
    dark,
    defaultDark,
    onDarkChange,
  );
  const mode: ManagementMode = resolvedDark ? "dark" : "light";

  const value = useMemo<ManagementThemeContextValue>(
    () => ({
      density: resolvedDensity,
      dark: resolvedDark,
      mode,
      setDensity,
      setDark,
      setMode: (nextMode) => {
        setDark(nextMode === "dark");
      },
      toggleDark: () => {
        setDark(!resolvedDark);
      },
    }),
    [mode, resolvedDark, resolvedDensity, setDark, setDensity],
  );

  return (
    <ManagementThemeContext.Provider value={value}>
      {children}
    </ManagementThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ManagementThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ManagementThemeProvider.");
  }

  return context;
}

export function useOptionalManagementTheme() {
  return useContext(ManagementThemeContext);
}
