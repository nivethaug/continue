import { JSONContent } from "@tiptap/react";
import { OnboardingStatus } from "../components/OnboardingCard";

type LocalStorageTypes = {
  isExploreDialogOpen: boolean;
  hasDismissedExploreDialog: boolean;
  onboardingStatus?: OnboardingStatus;
  hasDismissedOnboardingCard: boolean;
  mainTextEntryCounter: number;
  ide: "vscode" | "jetbrains";
  vsCodeUriScheme: string;
  fontSize: number;
  [key: `inputHistory_${string}`]: JSONContent[];
  extensionVersion: string;
  showTutorialCard: boolean;
  shownProfilesIntroduction: boolean;
  disableIndexing: boolean;
  hasExitedFreeTrial: boolean;
  hasDismissedCliInstallBanner: boolean;
};

export enum LocalStorageKey {
  IsExploreDialogOpen = "isExploreDialogOpen",
  HasDismissedExploreDialog = "hasDismissedExploreDialog",
  HasExitedFreeTrial = "hasExitedFreeTrial",
}

export function getLocalStorage<T extends keyof LocalStorageTypes>(
  key: T,
): LocalStorageTypes[T] | undefined {
  const value = localStorage.getItem(key);

  if (value === null) {
    return undefined;
  }

  // Check if value looks like valid JSON before parsing
  // JSON values start with: {, [, ", t (true), f (false), n (null), - or digit (numbers)
  const jsonLikePattern = /^[\{\[\"tfn\-0-9]/;

  if (!jsonLikePattern.test(value)) {
    // Not a JSON-like value, return as-is
    return value as LocalStorageTypes[T];
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error(
      `Error parsing ${key} from local storage. Value was ${value}\n\n`,
      error,
    );
    return undefined;
  }
}

export function setLocalStorage<T extends keyof LocalStorageTypes>(
  key: T,
  value: LocalStorageTypes[T],
): void {
  localStorage.setItem(key, JSON.stringify(value));

  // Dispatch custom event to notify current tab listeners
  window.dispatchEvent(
    new CustomEvent("localStorageChange", {
      detail: { key, value },
    }),
  );
}
