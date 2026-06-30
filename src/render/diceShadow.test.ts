import { describe, expect, it } from "vitest";
import { getDiceShadowState } from "./diceShadow";
import { renderConfig } from "./config";

const lightOffset = renderConfig.lighting.keyLightOffset;
const config = renderConfig.diceShadow;

describe("getDiceShadowState", () => {
  it("keeps the shadow dense and under the dice at rest", () => {
    const state = getDiceShadowState(
      { lightOffset, position: { x: 1.2, y: config.restHeight, z: -0.4 } },
      config,
    );

    expect(state.visible).toBe(true);
    expect(state.opacity).toBeCloseTo(config.maxOpacity);
    expect(state.position).toEqual([1.2, config.floorY, -0.4]);
    expect(state.scale).toEqual([config.baseScaleX, config.baseScaleZ]);
  });

  it("fades, grows, and offsets the shadow as the dice rises", () => {
    const low = getDiceShadowState(
      { lightOffset, position: { x: 0, y: config.restHeight, z: 0 } },
      config,
    );
    const high = getDiceShadowState(
      { lightOffset, position: { x: 0, y: config.restHeight + config.fadeHeight * 0.5, z: 0 } },
      config,
    );

    expect(high.visible).toBe(true);
    expect(high.opacity).toBeLessThan(low.opacity);
    expect(high.scale[0]).toBeGreaterThan(low.scale[0]);
    expect(high.scale[1]).toBeGreaterThan(low.scale[1]);
    expect(high.position[0]).toBeLessThan(low.position[0]);
    expect(high.position[2]).toBeLessThan(low.position[2]);
  });

  it("hides the shadow once the dice is high enough", () => {
    const state = getDiceShadowState(
      { lightOffset, position: { x: 0, y: config.restHeight + config.fadeHeight, z: 0 } },
      config,
    );

    expect(state.opacity).toBe(0);
    expect(state.visible).toBe(false);
  });
});
