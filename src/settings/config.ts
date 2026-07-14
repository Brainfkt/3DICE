export const diceAppearanceOptions = [
  {
    id: "ivory",
    label: "Ivoire satiné",
    bodyColor: "#fffaf2",
    pipColor: "#050403",
    roughness: 0.5,
    clearcoat: 0.64,
    clearcoatRoughness: 0.22,
  },
  {
    id: "sage",
    label: "Sauge mate",
    bodyColor: "#78917d",
    pipColor: "#f5efe2",
    roughness: 0.72,
    clearcoat: 0.18,
    clearcoatRoughness: 0.52,
  },
  {
    id: "garnet",
    label: "Grenat poli",
    bodyColor: "#8f2739",
    pipColor: "#fff4e3",
    roughness: 0.34,
    clearcoat: 0.86,
    clearcoatRoughness: 0.14,
  },
  {
    id: "graphite",
    label: "Graphite mineral",
    bodyColor: "#313533",
    pipColor: "#eee6d5",
    roughness: 0.62,
    clearcoat: 0.28,
    clearcoatRoughness: 0.38,
  },
] as const;

export const surfaceOptions = [
  {
    id: "graphite",
    label: "Graphite",
    background: "#151614",
    fog: "#151614",
    floor: "#50534b",
  },
  {
    id: "midnight",
    label: "Nuit",
    background: "#0e151b",
    fog: "#0e151b",
    floor: "#394852",
  },
  {
    id: "clay",
    label: "Argile",
    background: "#1b1210",
    fog: "#1b1210",
    floor: "#6f4d42",
  },
  {
    id: "sand",
    label: "Sable",
    background: "#27231c",
    fog: "#27231c",
    floor: "#837765",
  },
] as const;

export const worldTypeOptions = [
  { id: "open", label: "Ouvert" },
  { id: "bounded", label: "Borné" },
] as const;

export const diceCountOptions = [1, 2, 3, 4] as const;

export type DiceAppearanceId = (typeof diceAppearanceOptions)[number]["id"];
export type DiceAppearance = (typeof diceAppearanceOptions)[number];
export type SurfaceId = (typeof surfaceOptions)[number]["id"];
export type SurfaceTheme = (typeof surfaceOptions)[number];
export type WorldType = (typeof worldTypeOptions)[number]["id"];
export type DiceCount = (typeof diceCountOptions)[number];

export type AppSettings = {
  version: 1;
  diceAppearanceId: DiceAppearanceId;
  surfaceId: SurfaceId;
  worldType: WorldType;
  diceCount: DiceCount;
};

export const defaultAppSettings: AppSettings = {
  version: 1,
  diceAppearanceId: "ivory",
  surfaceId: "graphite",
  worldType: "open",
  diceCount: 1,
};

export const SETTINGS_STORAGE_KEY = "3dice.settings.v1";

function hasId<T extends { id: string }>(
  options: readonly T[],
  id: unknown,
): id is T["id"] {
  return typeof id === "string" && options.some((option) => option.id === id);
}

function isDiceCount(value: unknown): value is DiceCount {
  return typeof value === "number" && diceCountOptions.includes(value as DiceCount);
}

export function parseStoredSettings(raw: string | null): AppSettings {
  if (!raw) return defaultAppSettings;

  try {
    const candidate = JSON.parse(raw) as Partial<AppSettings>;

    return {
      version: 1,
      diceAppearanceId: hasId(
        diceAppearanceOptions,
        candidate.diceAppearanceId,
      )
        ? candidate.diceAppearanceId
        : defaultAppSettings.diceAppearanceId,
      surfaceId: hasId(surfaceOptions, candidate.surfaceId)
        ? candidate.surfaceId
        : defaultAppSettings.surfaceId,
      worldType: hasId(worldTypeOptions, candidate.worldType)
        ? candidate.worldType
        : defaultAppSettings.worldType,
      diceCount: isDiceCount(candidate.diceCount)
        ? candidate.diceCount
        : defaultAppSettings.diceCount,
    };
  } catch {
    return defaultAppSettings;
  }
}

export function loadStoredSettings(): AppSettings {
  if (typeof window === "undefined") return defaultAppSettings;

  try {
    return parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return defaultAppSettings;
  }
}

export function saveStoredSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing and storage policies must never block the local demo.
  }
}

export function getDiceAppearance(id: DiceAppearanceId) {
  return (
    diceAppearanceOptions.find((appearance) => appearance.id === id) ??
    diceAppearanceOptions[0]
  );
}

export function getSurfaceTheme(id: SurfaceId) {
  return surfaceOptions.find((surface) => surface.id === id) ?? surfaceOptions[0];
}
