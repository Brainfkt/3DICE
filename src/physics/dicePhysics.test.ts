import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { physicsConfig } from "./config";
import {
  clampDragTargetToReach,
  createSettleState,
  getDragTargetFromPointerDelta,
  getNextSettleState,
  getPointVelocity,
  getReleaseImpulse,
  getThrowVectors,
} from "./dicePhysics";

const sample = (position: THREE.Vector3, time: number) => ({ position, time });

function horizontalLength(vector: { x: number; z: number }) {
  return Math.hypot(vector.x, vector.z);
}

describe("getDragTargetFromPointerDelta", () => {
  const start = new THREE.Vector3(0, 1, 0);
  const rightAxis = new THREE.Vector3(1, 0, 0);
  const forwardAxis = new THREE.Vector3(0, 0, -1);

  it("maps horizontal pointer movement to the lateral world axis", () => {
    const result = getDragTargetFromPointerDelta({
      start,
      rightAxis,
      forwardAxis,
      horizontalPixels: 100,
      upwardPixels: 0,
      worldUnitsPerPixel: 0.01,
    });

    expect(result.x).toBeCloseTo(physicsConfig.drag.lateralGestureScale, 5);
    expect(result.y).toBeCloseTo(start.y, 5);
    expect(result.z).toBeCloseTo(start.z, 5);
  });

  it("maps upward pointer movement to lift and scene depth", () => {
    const result = getDragTargetFromPointerDelta({
      start,
      rightAxis,
      forwardAxis,
      horizontalPixels: 0,
      upwardPixels: 100,
      worldUnitsPerPixel: 0.01,
    });

    expect(result.x).toBeCloseTo(start.x, 5);
    expect(result.y).toBeCloseTo(
      start.y + physicsConfig.drag.verticalGestureScale,
      5,
    );
    expect(result.z).toBeCloseTo(-physicsConfig.drag.depthGestureScale, 5);
  });

  it("maps downward pointer movement to backward depth without pulling into the floor", () => {
    const result = getDragTargetFromPointerDelta({
      start,
      rightAxis,
      forwardAxis,
      horizontalPixels: 0,
      upwardPixels: -100,
      worldUnitsPerPixel: 0.01,
    });

    expect(result.x).toBeCloseTo(start.x, 5);
    expect(result.y).toBeCloseTo(
      start.y + physicsConfig.drag.verticalGestureScale,
      5,
    );
    expect(result.z).toBeCloseTo(physicsConfig.drag.depthGestureScale, 5);
  });

  it("combines lateral and depth movement for diagonal throws", () => {
    const result = getDragTargetFromPointerDelta({
      start,
      rightAxis,
      forwardAxis,
      horizontalPixels: 80,
      upwardPixels: 60,
      worldUnitsPerPixel: 0.01,
    });

    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBeGreaterThan(start.y);
    expect(result.z).toBeLessThan(0);
  });
});

describe("clampDragTargetToReach", () => {
  it("does not recenter a far-away grab point in an open world", () => {
    const origin = new THREE.Vector3(80, 1.2, -45);
    const point = origin.clone();

    const result = clampDragTargetToReach({
      point,
      origin,
      maxHorizontalDistance: physicsConfig.drag.maxAnchorDistance,
      minHeight: physicsConfig.drag.minAnchorHeight,
    });

    expect(result.x).toBeCloseTo(80, 5);
    expect(result.z).toBeCloseTo(-45, 5);
  });

  it("limits reach relative to the grabbed point rather than world origin", () => {
    const origin = new THREE.Vector3(80, 1.2, -45);
    const point = new THREE.Vector3(100, 1.2, -45);

    const result = clampDragTargetToReach({
      point,
      origin,
      maxHorizontalDistance: 6,
      minHeight: physicsConfig.drag.minAnchorHeight,
    });

    expect(result.x).toBeCloseTo(86, 5);
    expect(result.z).toBeCloseTo(-45, 5);
  });

  it("keeps the drag target above the minimum anchor height", () => {
    const result = clampDragTargetToReach({
      point: new THREE.Vector3(4, -2, 6),
      origin: new THREE.Vector3(4, 1, 6),
      maxHorizontalDistance: 6,
      minHeight: 0.18,
    });

    expect(result.y).toBe(0.18);
  });
});

describe("getThrowVectors", () => {
  it("keeps a short drag gentle", () => {
    const result = getThrowVectors([
      sample(new THREE.Vector3(0, 0, 0), 0),
      sample(new THREE.Vector3(0.08, 0.02, 0.04), 100),
    ]);

    expect(horizontalLength(result.pointVelocity)).toBeLessThan(0.25);
    expect(result.pointVelocity.y).toBeGreaterThan(physicsConfig.throw.verticalLift);
    expect(result.wristTorqueImpulse.y).toBeLessThan(0.02);
  });

  it("clamps a fast horizontal drag", () => {
    const result = getThrowVectors([
      sample(new THREE.Vector3(0, 0, 0), 0),
      sample(new THREE.Vector3(12, 0, 0), 80),
    ]);

    expect(horizontalLength(result.pointVelocity)).toBeCloseTo(
      physicsConfig.throw.maxHorizontalVelocity,
      5,
    );
    expect(result.pointVelocity.y).toBeLessThanOrEqual(
      physicsConfig.throw.maxVerticalVelocity,
    );
  });

  it("clamps a fast vertical drag", () => {
    const result = getThrowVectors([
      sample(new THREE.Vector3(0, 0, 0), 0),
      sample(new THREE.Vector3(0, 5, 0), 80),
    ]);

    expect(result.pointVelocity.y).toBe(physicsConfig.throw.maxVerticalVelocity);
  });
});

describe("getPointVelocity", () => {
  it("adds angular velocity around the body center", () => {
    const result = getPointVelocity(
      { x: 0.4, y: 0.1, z: 0 },
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    );

    expect(result).toEqual({ x: 0.4, y: 2.1, z: 0 });
  });
});

describe("getReleaseImpulse", () => {
  it("returns no impulse when the grabbed point already follows the gesture", () => {
    const result = getReleaseImpulse(
      { x: 1, y: 2, z: 3 },
      { x: 1, y: 2, z: 3 },
    );

    expect(result).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("clamps unrealistic point speed changes", () => {
    const result = getReleaseImpulse(
      { x: 100, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    );

    expect(Math.hypot(result.x, result.y, result.z)).toBeLessThanOrEqual(
      physicsConfig.throw.maxPointImpulse,
    );
  });

  it("scales regular release impulse with the active dice mass", () => {
    const lightResult = getReleaseImpulse(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      0.4,
    );
    const heavierResult = getReleaseImpulse(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      0.8,
    );

    expect(heavierResult.x).toBeCloseTo(lightResult.x * 2, 5);
  });
});

describe("getNextSettleState", () => {
  it("waits for enough still frames before settling", () => {
    let state = createSettleState();

    for (let i = 0; i < physicsConfig.settle.framesRequired - 1; i += 1) {
      state = getNextSettleState(state, true, 4);
    }

    expect(state.settledFace).toBeNull();

    state = getNextSettleState(state, true, 4);

    expect(state.settledFace).toBe(4);
  });

  it("resets when the body moves again", () => {
    let state = createSettleState();

    for (let i = 0; i < 12; i += 1) {
      state = getNextSettleState(state, true, 2);
    }

    state = getNextSettleState(state, false, 2);

    expect(state).toEqual(createSettleState());
  });

  it("requires the final face to stay stable before settling", () => {
    let state = createSettleState();

    for (let i = 0; i < physicsConfig.settle.framesRequired; i += 1) {
      const face = i < physicsConfig.settle.framesRequired - 4 ? 1 : 6;
      state = getNextSettleState(state, true, face);
    }

    expect(state.settledFace).toBeNull();

    for (
      let i = state.stableFaceFrames;
      i < physicsConfig.settle.stableFaceFramesRequired;
      i += 1
    ) {
      state = getNextSettleState(state, true, 6);
    }

    expect(state.settledFace).toBe(6);
  });
});
