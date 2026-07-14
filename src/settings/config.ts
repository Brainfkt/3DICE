import { keyboardThrowPowerConfig } from "../physics/config";

export const diceAppearanceOptions = [
  {
    id: "ivory",
    label: "Ivoire satiné",
    bodyColor: "#fffaf2",
    pipColor: "#050403",
    roughness: 0.5,
    clearcoat: 0.64,
    clearcoatRoughness: 0.22,
    metalness: 0,
    transmission: 0,
  },
  {
    id: "sage",
    label: "Sauge mate",
    bodyColor: "#78917d",
    pipColor: "#f5efe2",
    roughness: 0.72,
    clearcoat: 0.18,
    clearcoatRoughness: 0.52,
    metalness: 0,
    transmission: 0,
  },
  {
    id: "garnet",
    label: "Grenat poli",
    bodyColor: "#8f2739",
    pipColor: "#fff4e3",
    roughness: 0.34,
    clearcoat: 0.86,
    clearcoatRoughness: 0.14,
    metalness: 0,
    transmission: 0,
  },
  {
    id: "graphite",
    label: "Graphite mineral",
    bodyColor: "#313533",
    pipColor: "#eee6d5",
    roughness: 0.62,
    clearcoat: 0.28,
    clearcoatRoughness: 0.38,
    metalness: 0.04,
    transmission: 0,
  },
  {
    id: "obsidian",
    label: "Obsidienne",
    bodyColor: "#151716",
    pipColor: "#ede5d3",
    roughness: 0.24,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
    metalness: 0.02,
    transmission: 0,
  },
  {
    id: "brushed-metal",
    label: "Métal brossé",
    bodyColor: "#9b9d99",
    pipColor: "#171817",
    roughness: 0.42,
    clearcoat: 0.18,
    clearcoatRoughness: 0.34,
    metalness: 0.86,
    transmission: 0,
  },
  {
    id: "marble",
    label: "Marbre clair",
    bodyColor: "#d9d5c9",
    pipColor: "#262724",
    roughness: 0.58,
    clearcoat: 0.34,
    clearcoatRoughness: 0.3,
    metalness: 0,
    transmission: 0,
  },
  {
    id: "translucent",
    label: "Verre fumé",
    bodyColor: "#93a6a0",
    pipColor: "#f3ecdb",
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    metalness: 0,
    transmission: 0.72,
  },
] as const;

export const surfaceOptions = [
  {
    id: "graphite",
    label: "Graphite",
    background: "#151614",
    fog: "#151614",
    floor: "#50534b",
    texture: "felt",
    roughness: 1,
    metalness: 0,
    normalScale: 0.06,
    repeat: 860,
  },
  {
    id: "midnight",
    label: "Nuit",
    background: "#0e151b",
    fog: "#0e151b",
    floor: "#394852",
    texture: "felt",
    roughness: 0.96,
    metalness: 0,
    normalScale: 0.055,
    repeat: 900,
  },
  {
    id: "clay",
    label: "Argile",
    background: "#1b1210",
    fog: "#1b1210",
    floor: "#6f4d42",
    texture: "stone",
    roughness: 0.92,
    metalness: 0,
    normalScale: 0.075,
    repeat: 720,
  },
  {
    id: "sand",
    label: "Sable",
    background: "#27231c",
    fog: "#27231c",
    floor: "#837765",
    texture: "stone",
    roughness: 0.9,
    metalness: 0,
    normalScale: 0.065,
    repeat: 760,
  },
  {
    id: "felt",
    label: "Feutre vert",
    background: "#0f1814",
    fog: "#0f1814",
    floor: "#345849",
    texture: "felt",
    roughness: 1,
    metalness: 0,
    normalScale: 0.085,
    repeat: 980,
  },
  {
    id: "dark-wood",
    label: "Bois sombre",
    background: "#17110e",
    fog: "#17110e",
    floor: "#654432",
    texture: "wood",
    roughness: 0.72,
    metalness: 0,
    normalScale: 0.075,
    repeat: 460,
  },
  {
    id: "slate",
    label: "Pierre",
    background: "#121416",
    fog: "#121416",
    floor: "#565b5e",
    texture: "stone",
    roughness: 0.94,
    metalness: 0.02,
    normalScale: 0.1,
    repeat: 650,
  },
  {
    id: "frosted-glass",
    label: "Verre dépoli",
    background: "#11191d",
    fog: "#11191d",
    floor: "#718086",
    texture: "glass",
    roughness: 0.36,
    metalness: 0.08,
    normalScale: 0.025,
    repeat: 320,
  },
] as const;

export const lightingPresetOptions = [
  {
    id: "studio",
    label: "Studio clair",
    ambientIntensity: 0.22,
    hemisphereIntensity: 0.38,
    hemisphereSkyColor: "#dfe7f4",
    hemisphereGroundColor: "#161711",
    environmentIntensity: 1.15,
    keyColor: "#fff2d8",
    keyIntensity: 20,
    toneMappingExposure: 1.15,
    warmth: 0,
  },
  {
    id: "table-warm",
    label: "Table chaude",
    ambientIntensity: 0.2,
    hemisphereIntensity: 0.34,
    hemisphereSkyColor: "#ffe3bd",
    hemisphereGroundColor: "#24140d",
    environmentIntensity: 1.05,
    keyColor: "#ffd39f",
    keyIntensity: 18,
    toneMappingExposure: 1.08,
    warmth: 1,
  },
  {
    id: "night-neon",
    label: "Nuit néon",
    ambientIntensity: 0.14,
    hemisphereIntensity: 0.26,
    hemisphereSkyColor: "#8fb8d6",
    hemisphereGroundColor: "#15101d",
    environmentIntensity: 0.92,
    keyColor: "#b8dcff",
    keyIntensity: 15,
    toneMappingExposure: 1.02,
    warmth: -1,
  },
] as const;

export const diceTypeOptions = [
  { id: "d6", label: "d6", faces: 6 },
  { id: "d4", label: "d4", faces: 4 },
  { id: "d8", label: "d8", faces: 8 },
  { id: "d10", label: "d10", faces: 10 },
  { id: "d12", label: "d12", faces: 12 },
  { id: "d20", label: "d20", faces: 20 },
] as const;

export const diceCountOptions = [1, 2, 3, 4] as const;

export type DiceAppearanceId = (typeof diceAppearanceOptions)[number]["id"];
export type DiceAppearance = (typeof diceAppearanceOptions)[number];
export type SurfaceId = (typeof surfaceOptions)[number]["id"];
export type SurfaceTheme = (typeof surfaceOptions)[number];
export type LightingPresetId = (typeof lightingPresetOptions)[number]["id"];
export type LightingPreset = (typeof lightingPresetOptions)[number];
export type DiceTypeId = (typeof diceTypeOptions)[number]["id"];
export type DiceCount = (typeof diceCountOptions)[number];

export type AppSettings = {
  version: 3;
  advancedMode: boolean;
  audioEnabled: boolean;
  hapticsEnabled: boolean;
  impactEffectsEnabled: boolean;
  historyEnabled: boolean;
  resultAnimationEnabled: boolean;
  autoRecenterEnabled: boolean;
  cameraGesturesEnabled: boolean;
  diceAppearanceId: DiceAppearanceId;
  surfaceId: SurfaceId;
  lightingPresetId: LightingPresetId;
  diceType: DiceTypeId;
  diceCount: DiceCount;
  throwPower: number;
};

export const defaultAppSettings: AppSettings = {
  version: 3,
  advancedMode: false,
  audioEnabled: true,
  hapticsEnabled: true,
  impactEffectsEnabled: true,
  historyEnabled: false,
  resultAnimationEnabled: true,
  autoRecenterEnabled: true,
  cameraGesturesEnabled: true,
  diceAppearanceId: "ivory",
  surfaceId: "graphite",
  lightingPresetId: "studio",
  diceType: "d6",
  diceCount: 1,
  throwPower: 1,
};

export const SETTINGS_STORAGE_KEY = "3dice.settings.v3";
const PREVIOUS_SETTINGS_STORAGE_KEY = "3dice.settings.v2";
const LEGACY_SETTINGS_STORAGE_KEY = "3dice.settings.v1";

function hasId<T extends { id: string }>(
  options: readonly T[],
  id: unknown,
): id is T["id"] {
  return typeof id === "string" && options.some((option) => option.id === id);
}

function isDiceCount(value: unknown): value is DiceCount {
  return typeof value === "number" && diceCountOptions.includes(value as DiceCount);
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parseThrowPower(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(
        Math.max(value, keyboardThrowPowerConfig.min),
        keyboardThrowPowerConfig.max,
      )
    : defaultAppSettings.throwPower;
}

export function parseStoredSettings(raw: string | null): AppSettings {
  if (!raw) return defaultAppSettings;

  try {
    const candidate = JSON.parse(raw) as Partial<AppSettings>;

    return {
      version: 3,
      advancedMode: booleanOrDefault(
        candidate.advancedMode,
        defaultAppSettings.advancedMode,
      ),
      audioEnabled: booleanOrDefault(
        candidate.audioEnabled,
        defaultAppSettings.audioEnabled,
      ),
      hapticsEnabled: booleanOrDefault(
        candidate.hapticsEnabled,
        defaultAppSettings.hapticsEnabled,
      ),
      impactEffectsEnabled: booleanOrDefault(
        candidate.impactEffectsEnabled,
        defaultAppSettings.impactEffectsEnabled,
      ),
      historyEnabled: booleanOrDefault(
        candidate.historyEnabled,
        defaultAppSettings.historyEnabled,
      ),
      resultAnimationEnabled: booleanOrDefault(
        candidate.resultAnimationEnabled,
        defaultAppSettings.resultAnimationEnabled,
      ),
      autoRecenterEnabled: booleanOrDefault(
        candidate.autoRecenterEnabled,
        defaultAppSettings.autoRecenterEnabled,
      ),
      cameraGesturesEnabled: booleanOrDefault(
        candidate.cameraGesturesEnabled,
        defaultAppSettings.cameraGesturesEnabled,
      ),
      diceAppearanceId: hasId(
        diceAppearanceOptions,
        candidate.diceAppearanceId,
      )
        ? candidate.diceAppearanceId
        : defaultAppSettings.diceAppearanceId,
      surfaceId: hasId(surfaceOptions, candidate.surfaceId)
        ? candidate.surfaceId
        : defaultAppSettings.surfaceId,
      lightingPresetId: hasId(
        lightingPresetOptions,
        candidate.lightingPresetId,
      )
        ? candidate.lightingPresetId
        : defaultAppSettings.lightingPresetId,
      diceType: hasId(diceTypeOptions, candidate.diceType)
        ? candidate.diceType
        : defaultAppSettings.diceType,
      diceCount: isDiceCount(candidate.diceCount)
        ? candidate.diceCount
        : defaultAppSettings.diceCount,
      throwPower: parseThrowPower(candidate.throwPower),
    };
  } catch {
    return defaultAppSettings;
  }
}

export function loadStoredSettings(): AppSettings {
  if (typeof window === "undefined") return defaultAppSettings;

  try {
    return parseStoredSettings(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) ??
        window.localStorage.getItem(PREVIOUS_SETTINGS_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY),
    );
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

export function getLightingPreset(id: LightingPresetId) {
  return (
    lightingPresetOptions.find((preset) => preset.id === id) ??
    lightingPresetOptions[0]
  );
}

export function getDiceType(id: DiceTypeId) {
  return diceTypeOptions.find((type) => type.id === id) ?? diceTypeOptions[0];
}
