import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { renderConfig } from "./config";
import { getShadowCastingSources, setLightPosition } from "./lighting";

describe("lighting configuration", () => {
  it("keeps a single shadow-casting source for predictable performance", () => {
    const shadowCasters = getShadowCastingSources(renderConfig.lighting.sources);

    expect(shadowCasters).toHaveLength(1);
    expect(shadowCasters[0].kind).toBe("spot");
    expect(shadowCasters[0].decay).toBe(2);
    expect(shadowCasters[0].shadow?.intensity).toBeLessThan(1);
    expect(shadowCasters[0].shadow?.radius).toBeGreaterThan(1);
  });

  it("uses a local one-shot studio environment instead of a remote preset", () => {
    expect(renderConfig.lighting.environmentResolution).toBeLessThanOrEqual(256);
    expect(renderConfig.lighting.lightformers).toHaveLength(3);
    expect(
      renderConfig.lighting.lightformers.every(
        (lightformer) => lightformer.intensity > 0,
      ),
    ).toBe(true);
  });

  it("follows the dice on the floor plane while keeping a fixed studio height", () => {
    const key = renderConfig.lighting.sources[0];
    const output = new THREE.Vector3();

    expect(setLightPosition({ x: 2, y: 4.5, z: -3 }, key, output)).toBe(output);
    expect(output.toArray()).toEqual([
      2 + key.offset[0],
      key.offset[1],
      -3 + key.offset[2],
    ]);
  });
});
