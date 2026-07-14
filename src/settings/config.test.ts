import { describe, expect, it } from "vitest";
import {
  defaultAppSettings,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
} from "./config";

describe("stored app settings", () => {
  it("keeps the single ivory die setup as the default", () => {
    expect(defaultAppSettings).toEqual({
      version: 2,
      diceAppearanceId: "ivory",
      surfaceId: "graphite",
      diceCount: 1,
    });
    expect(SETTINGS_STORAGE_KEY).toContain("v2");
  });

  it("restores every supported setting", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          version: 2,
          diceAppearanceId: "garnet",
          surfaceId: "clay",
          diceCount: 4,
        }),
      ),
    ).toEqual({
      version: 2,
      diceAppearanceId: "garnet",
      surfaceId: "clay",
      diceCount: 4,
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
      version: 2,
      diceAppearanceId: "sage",
      surfaceId: "sand",
      diceCount: 3,
    });
  });
});
