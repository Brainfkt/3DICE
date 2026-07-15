import { describe, expect, it } from "vitest";
import {
  defaultAppSettings,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
} from "./config";

describe("stored app settings", () => {
  it("keeps the single ivory die setup as the default", () => {
    expect(defaultAppSettings).toEqual({
      version: 4,
      advancedMode: false,
      audioEnabled: true,
      autoRecenterEnabled: true,
      cameraGesturesEnabled: true,
      cameraView: "free",
      diceAppearanceId: "ivory",
      diceCount: 1,
      diceType: "d6",
      hapticsEnabled: true,
      historyEnabled: false,
      impactEffectsEnabled: true,
      lightingPresetId: "studio",
      resultAnimationEnabled: true,
      surfaceId: "graphite",
      throwPower: 1,
    });
    expect(SETTINGS_STORAGE_KEY).toContain("v4");
  });

  it("restores every supported setting", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          version: 4,
          advancedMode: true,
          audioEnabled: false,
          autoRecenterEnabled: false,
          cameraGesturesEnabled: false,
          cameraView: "top",
          diceAppearanceId: "brushed-metal",
          diceCount: 4,
          diceType: "d20",
          hapticsEnabled: false,
          historyEnabled: true,
          impactEffectsEnabled: false,
          lightingPresetId: "night-neon",
          resultAnimationEnabled: false,
          surfaceId: "dark-wood",
          throwPower: 1.25,
        }),
      ),
    ).toEqual({
      version: 4,
      advancedMode: true,
      audioEnabled: false,
      autoRecenterEnabled: false,
      cameraGesturesEnabled: false,
      cameraView: "top",
      diceAppearanceId: "brushed-metal",
      diceCount: 4,
      diceType: "d20",
      hapticsEnabled: false,
      historyEnabled: true,
      impactEffectsEnabled: false,
      lightingPresetId: "night-neon",
      resultAnimationEnabled: false,
      surfaceId: "dark-wood",
      throwPower: 1.25,
    });
  });

  it("falls back field by field for malformed or stale values", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          diceAppearanceId: "missing",
          surfaceId: "midnight",
          diceCount: 12,
        }),
      ),
    ).toEqual({
      ...defaultAppSettings,
      surfaceId: "midnight",
    });
    expect(parseStoredSettings("not-json")).toEqual(defaultAppSettings);
    expect(parseStoredSettings(null)).toEqual(defaultAppSettings);
  });

  it("migrates useful fields from the previous world-aware schema", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          version: 1,
          diceAppearanceId: "sage",
          surfaceId: "sand",
          worldType: "bounded",
          diceCount: 3,
        }),
      ),
    ).toEqual({
      ...defaultAppSettings,
      diceAppearanceId: "sage",
      surfaceId: "sand",
      diceCount: 3,
    });
  });

  it("clamps advanced throw power and rejects stale advanced ids", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          advancedMode: true,
          cameraView: "side",
          diceType: "d100",
          lightingPresetId: "sunset",
          throwPower: 4,
        }),
      ),
    ).toEqual({
      ...defaultAppSettings,
      advancedMode: true,
      cameraView: "free",
      throwPower: 1.35,
    });
  });
});
