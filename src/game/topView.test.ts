import { describe, expect, it } from "vitest";
import { physicsWorldConfig } from "../physics/config";
import { renderConfig } from "../render/config";
import { getTopViewLayout, getTopViewThrowPlans } from "./topView";

describe("top view layout", () => {
  it("keeps desktop boundaries inside the visible camera footprint", () => {
    const layout = getTopViewLayout(16 / 9);

    expect(layout.cameraDistance).toBe(renderConfig.camera.topView.baseDistance);
    expect(layout.boundaryHalfWidth).toBeLessThan(layout.visibleHalfWidth);
    expect(layout.boundaryHalfDepth).toBeLessThan(layout.visibleHalfDepth);
    expect(layout.visibleHalfWidth - layout.boundaryHalfWidth).toBeCloseTo(
      physicsWorldConfig.topViewBounds.screenMargin,
    );
    expect(layout.visibleHalfDepth - layout.boundaryHalfDepth).toBeCloseTo(
      physicsWorldConfig.topViewBounds.screenMargin,
    );
  });

  it("raises the mobile camera enough for the centered dice formation", () => {
    const layout = getTopViewLayout(390 / 844);

    expect(layout.cameraDistance).toBeGreaterThan(
      renderConfig.camera.topView.baseDistance,
    );
    expect(layout.boundaryHalfWidth).toBeGreaterThanOrEqual(
      physicsWorldConfig.topViewBounds.minimumHalfWidth,
    );
    expect(layout.boundaryHalfDepth).toBeGreaterThan(layout.boundaryHalfWidth);
    expect(layout.cameraPosition).toEqual([0, layout.cameraDistance, 0]);
  });

  it("returns finite safe bounds for a malformed aspect", () => {
    const layout = getTopViewLayout(Number.NaN);
    const values = [
      layout.boundaryHalfDepth,
      layout.boundaryHalfWidth,
      layout.cameraDistance,
      ...layout.cameraPosition,
      layout.visibleHalfDepth,
      layout.visibleHalfWidth,
    ];

    expect(values.every(Number.isFinite)).toBe(true);
  });
});

describe("top view throw plans", () => {
  it("starts every die outside the camera footprint and aims inward", () => {
    const layout = getTopViewLayout(16 / 9);
    const samples = [0.1, 0.25, 0.4, 0.6, 0.75, 0.2, 0.8, 0.3, 0.1];
    let sampleIndex = 0;
    const plans = getTopViewThrowPlans({
      count: 2,
      initialHeight: 0.58,
      layout,
      random: () => samples[sampleIndex++ % samples.length],
    });

    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      const [x, , z] = plan.position;
      const [directionX, directionY, directionZ] = plan.direction;
      const startsOutside =
        Math.abs(x) > layout.visibleHalfWidth ||
        Math.abs(z) > layout.visibleHalfDepth;

      expect(startsOutside).toBe(true);
      expect(directionY).toBe(0);
      expect(Math.hypot(directionX, directionZ)).toBeCloseTo(1);
      expect(directionX * -x + directionZ * -z).toBeGreaterThan(0);
      expect(plan.targetDistance).toBeGreaterThan(0);
    }
  });

  it("varies the entry side with the random seed", () => {
    const layout = getTopViewLayout(390 / 844);
    const first = getTopViewThrowPlans({
      count: 1,
      initialHeight: 0.58,
      layout,
      random: () => 0.1,
    })[0];
    const second = getTopViewThrowPlans({
      count: 1,
      initialHeight: 0.58,
      layout,
      random: () => 0.6,
    })[0];

    expect(first.position).not.toEqual(second.position);
  });
});
