import { describe, expect, it } from "vitest";
import { createIvoryRoughnessData } from "./ivoryTexture";

describe("createIvoryRoughnessData", () => {
  it("creates deterministic roughness data from the same seed", () => {
    const input = { seed: 0x1c0ffee, size: 8, baseValue: 218, variation: 24 };

    expect(createIvoryRoughnessData(input)).toEqual(createIvoryRoughnessData(input));
  });

  it("changes the roughness pattern when the seed changes", () => {
    const input = { size: 8, baseValue: 218, variation: 24 };

    expect(createIvoryRoughnessData({ ...input, seed: 1 })).not.toEqual(
      createIvoryRoughnessData({ ...input, seed: 2 }),
    );
  });

  it("keeps roughness pixels within byte bounds and opaque", () => {
    const data = createIvoryRoughnessData({
      seed: 0x1c0ffee,
      size: 16,
      baseValue: 218,
      variation: 24,
    });

    expect(data).toHaveLength(16 * 16 * 4);

    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
      expect(data[i + 1]).toBe(data[i]);
      expect(data[i + 2]).toBe(data[i]);
      expect(data[i + 3]).toBe(255);
    }
  });
});
