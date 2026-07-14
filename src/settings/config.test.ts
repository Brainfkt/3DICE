import { describe, expect, it } from "vitest";
import {
  defaultAppSettings,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
} from "./config";

describe("stored app settings", () => {
  it("keeps the open, single ivory die setup as the default", () => {
    expect(defaultAppSettings).toEqual({
      version: 1,
      diceAppearanceId: "ivory",
      surfaceId: "graphite",
      worldType: "open",
      diceCount: 1,
    });
    expect(SETTINGS_STORAGE_KEY).toContain("v1");
  });

  it("restores every supported setting", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          version: 1,
          diceAppearanceId: "garnet",
          surfaceId: "clay",
          worldType: "bounded",
          diceCount: 4,
        }),
      ),
    ).toEqual({
      version: 1,
      diceAppearanceId: "garnet",
      surfaceId: "clay",
      worldType: "bounded",
      diceCount: 4,
    });
  });

  it("falls back field by field for malformed or stale values", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          diceAppearanceId: "missing",
          surfaceId: "midnight",
          worldType: "infinite",
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
});
