import { describe, expect, it } from "vitest";
import { createFloorNoiseDots } from "./floorTexture";

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
