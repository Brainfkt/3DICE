import { describe, expect, it } from "vitest";
import { createFloorNoiseDots, createFloorTextureData } from "./floorTexture";

describe("createFloorNoiseDots", () => {
  it("creates deterministic noise from the same seed", () => {
    const input = { seed: 0x3d1ce, count: 8, width: 128, height: 128 };

    expect(createFloorNoiseDots(input)).toEqual(createFloorNoiseDots(input));
  });

  it("changes the noise pattern when the seed changes", () => {
    const input = { count: 8, width: 128, height: 128 };

    expect(createFloorNoiseDots({ ...input, seed: 1 })).not.toEqual(
      createFloorNoiseDots({ ...input, seed: 2 }),
    );
  });

  it("keeps dot values and positions within texture bounds", () => {
    const dots = createFloorNoiseDots({
      seed: 0x3d1ce,
      count: 128,
      width: 64,
      height: 32,
    });

    expect(dots).toHaveLength(128);

    for (const dot of dots) {
      expect(dot.value).toBeGreaterThanOrEqual(34);
      expect(dot.value).toBeLessThan(68);
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThan(64);
      expect(dot.y).toBeGreaterThanOrEqual(0);
      expect(dot.y).toBeLessThan(32);
    }
  });
});

describe("createFloorTextureData", () => {
  it("creates deterministic texture data from the same seed", () => {
    const input = {
      seed: 0x3d1ce,
      width: 8,
      height: 8,
      baseValue: 38,
      variation: 9,
      fiberStrength: 7,
      speckleStrength: 18,
    };

    expect(createFloorTextureData(input)).toEqual(createFloorTextureData(input));
  });

  it("changes the texture pattern when the seed changes", () => {
    const input = {
      width: 8,
      height: 8,
      baseValue: 38,
      variation: 9,
      fiberStrength: 7,
      speckleStrength: 18,
    };

    expect(createFloorTextureData({ ...input, seed: 1 })).not.toEqual(
      createFloorTextureData({ ...input, seed: 2 }),
    );
  });

  it("keeps pixels within byte bounds and opaque", () => {
    const data = createFloorTextureData({
      seed: 0x3d1ce,
      width: 16,
      height: 12,
      baseValue: 38,
      variation: 9,
      fiberStrength: 7,
      speckleStrength: 18,
    });

    expect(data).toHaveLength(16 * 12 * 4);

    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
      expect(data[i + 1]).toBeGreaterThanOrEqual(0);
      expect(data[i + 1]).toBeLessThanOrEqual(255);
      expect(data[i + 2]).toBeGreaterThanOrEqual(0);
      expect(data[i + 2]).toBeLessThanOrEqual(255);
      expect(data[i + 3]).toBe(255);
    }
  });
});
