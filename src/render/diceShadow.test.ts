import { describe, expect, it } from "vitest";
import { getProjectedDiceShadowState } from "./diceShadow";
import { renderConfig } from "./config";

const lightOffset = renderConfig.lighting.keyLightOffset;
const config = renderConfig.diceShadow;
const identityQuaternion = { x: 0, y: 0, z: 0, w: 1 };

describe("getProjectedDiceShadowState", () => {
  it("projects a dense cube-shaped shadow near the dice at rest", () => {
    const state = getProjectedDiceShadowState(
      {
        lightOffset,
        position: { x: 1.2, y: config.restHeight, z: -0.4 },
        quaternion: identityQuaternion,
      },
      config,
    );

    expect(state.visible).toBe(true);
    expect(state.opacity).toBeCloseTo(config.maxOpacity);
    expect(state.points.length).toBeGreaterThanOrEqual(4);
    expect(state.size[0]).toBeGreaterThan(config.halfSize);
    expect(state.size[1]).toBeGreaterThan(config.halfSize);
  });

  it("fades, softens, grows, and offsets the projected hull as the dice rises", () => {
    const low = getProjectedDiceShadowState(
      { lightOffset, position: { x: 0, y: config.restHeight, z: 0 }, quaternion: identityQuaternion },
      config,
    );
    const high = getProjectedDiceShadowState(
      {
        lightOffset,
        position: { x: 0, y: config.restHeight + config.fadeHeight * 0.5, z: 0 },
        quaternion: identityQuaternion,
      },
      config,
    );

    expect(high.visible).toBe(true);
    expect(high.opacity).toBeLessThan(low.opacity);
    expect(high.blurPx).toBeGreaterThan(low.blurPx);
    expect(high.size[0]).toBeGreaterThan(low.size[0]);
    expect(high.size[1]).toBeGreaterThan(low.size[1]);
    expect(high.position[0]).toBeLessThan(low.position[0]);
    expect(high.position[2]).toBeLessThan(low.position[2]);
  });

  it("hides the shadow once the dice is high enough", () => {
    const state = getProjectedDiceShadowState(
      {
        lightOffset,
        position: { x: 0, y: config.restHeight + config.fadeHeight, z: 0 },
        quaternion: identityQuaternion,
      },
      config,
    );

    expect(state.opacity).toBe(0);
    expect(state.visible).toBe(false);
  });

  it("changes the projected hull when the dice rotates", () => {
    const flat = getProjectedDiceShadowState(
      { lightOffset, position: { x: 0, y: config.restHeight, z: 0 }, quaternion: identityQuaternion },
      config,
    );
    const rotated = getProjectedDiceShadowState(
      {
        lightOffset,
        position: { x: 0, y: config.restHeight, z: 0 },
        quaternion: { x: 0, y: 0.3826834324, z: 0, w: 0.9238795325 },
      },
      config,
    );

    expect(rotated.points).not.toEqual(flat.points);
  });
});
