import { describe, expect, it } from "vitest";
import { renderConfig } from "./config";
import { getLightPosition, getShadowCastingSources } from "./lighting";

describe("lighting configuration", () => {
  it("keeps a single shadow-casting source for predictable performance", () => {
    const shadowCasters = getShadowCastingSources(renderConfig.lighting.sources);

    expect(shadowCasters).toHaveLength(1);
    expect(shadowCasters[0].kind).toBe("spot");
  });

  it("derives light world positions from the tracked dice target", () => {
    const key = renderConfig.lighting.sources[0];

    expect(getLightPosition({ x: 2, y: 0.5, z: -3 }, key)).toEqual([
      2 + key.offset[0],
      0.5 + key.offset[1],
      -3 + key.offset[2],
    ]);
  });
});
