import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { physicsConfig } from "./config";
import {
  appendPointerSample,
  clampDragTargetToReach,
  createSettleState,
  getDragTargetFromPointerDelta,
  getKeyboardThrowVectors,
  getLocalPointFromWorldOffset,
  getLimitedBodyMotion,
  getNextSettleState,
  getPointVelocity,
  getPointerGestureVelocity,
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

describe("getKeyboardThrowVectors", () => {
  it("creates a finite, strong camera-relative throw", () => {
    const randomValues = [0.5, 0.5, 0.75];
    const result = getKeyboardThrowVectors({
      forwardAxis: { x: 0, y: -0.8, z: -4 },
      rightAxis: { x: 3, y: 0.2, z: 0 },
      random: () => randomValues.shift() ?? 0.5,
    });

    expect(result.pointVelocity.x).toBeCloseTo(0, 6);
    expect(result.pointVelocity.y).toBeCloseTo(
      physicsConfig.throw.keyboard.verticalVelocity,
      6,
    );
    expect(result.pointVelocity.z).toBeCloseTo(
      -physicsConfig.throw.keyboard.forwardVelocity,
      6,
    );
    expect(
      Object.values(result.pointVelocity).every(Number.isFinite),
    ).toBe(true);
    expect(
      Object.values(result.wristTorqueImpulse).every(Number.isFinite),
    ).toBe(true);
  });

  it("keeps power and lateral variation inside the configured range", () => {
    const weak = getKeyboardThrowVectors({
      forwardAxis: { x: 0, y: 0, z: -1 },
      rightAxis: { x: 1, y: 0, z: 0 },
      random: () => 0,
    });
    const strong = getKeyboardThrowVectors({
      forwardAxis: { x: 0, y: 0, z: -1 },
      rightAxis: { x: 1, y: 0, z: 0 },
      random: () => 1,
    });
    const weakSpeed = Math.hypot(
      weak.pointVelocity.x,
      weak.pointVelocity.y,
      weak.pointVelocity.z,
    );
    const strongSpeed = Math.hypot(
      strong.pointVelocity.x,
      strong.pointVelocity.y,
      strong.pointVelocity.z,
    );

    expect(weak.pointVelocity.x).toBeLessThan(0);
    expect(strong.pointVelocity.x).toBeGreaterThan(0);
    expect(weak.pointVelocity.z).toBeLessThan(0);
    expect(strong.pointVelocity.z).toBeLessThan(0);
    expect(weak.pointVelocity.y).toBeGreaterThan(
      Math.hypot(weak.pointVelocity.x, weak.pointVelocity.z),
    );
    expect(strongSpeed).toBeGreaterThan(weakSpeed);
    expect(strongSpeed).toBeLessThan(
      physicsConfig.throw.keyboard.maxPointSpeedDelta,
    );
  });

  it("falls back to stable horizontal axes when inputs are degenerate", () => {
    const result = getKeyboardThrowVectors({
      forwardAxis: { x: 0, y: 1, z: 0 },
      rightAxis: { x: 0, y: 1, z: 0 },
      random: () => 0.5,
    });

    expect(Object.values(result.pointVelocity).every(Number.isFinite)).toBe(true);
    expect(horizontalLength(result.pointVelocity)).toBeCloseTo(
      physicsConfig.throw.keyboard.forwardVelocity,
      5,
    );
  });

  it("always applies tumble torque around the natural forward-roll axis", () => {
    const forward = new THREE.Vector3(1, 0, -2).normalize();
    const result = getKeyboardThrowVectors({
      forwardAxis: forward,
      rightAxis: new THREE.Vector3(2, 0, 1),
      random: () => 0.5,
    });
    const forwardRollAxis = new THREE.Vector3(0, 1, 0)
      .cross(forward)
      .normalize();
    const torque = new THREE.Vector3(
      result.wristTorqueImpulse.x,
      result.wristTorqueImpulse.y,
      result.wristTorqueImpulse.z,
    );

    expect(torque.dot(forwardRollAxis)).toBeGreaterThan(0);
  });
});

describe("getLocalPointFromWorldOffset", () => {
  it("keeps the keyboard impulse above the body after any settled rotation", () => {
    const bodyRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.74, -1.12, 0.39),
    );
    const worldOffset = new THREE.Vector3(
      ...physicsConfig.throw.keyboard.worldImpulseOffset,
    );
    const localPoint = getLocalPointFromWorldOffset(worldOffset, bodyRotation);
    const reconstructedWorldOffset = new THREE.Vector3(
      localPoint.x,
      localPoint.y,
      localPoint.z,
    ).applyQuaternion(bodyRotation);

    expect(reconstructedWorldOffset.x).toBeCloseTo(0, 6);
    expect(reconstructedWorldOffset.y).toBeCloseTo(
      physicsConfig.throw.keyboard.worldImpulseOffset[1],
      6,
    );
    expect(reconstructedWorldOffset.z).toBeCloseTo(0, 6);
  });
});

describe("pointer velocity sampling", () => {
  it("keeps a time-based history instead of only the last six events", () => {
    let samples: ReturnType<typeof sample>[] = [];

    for (let time = 0; time <= 120; time += 5) {
      samples = appendPointerSample(
        samples,
        sample(new THREE.Vector3(time / 100, 0, 0), time),
      );
    }

    expect(samples.length).toBeGreaterThan(6);
    expect(samples[0].time).toBe(0);
    expect(samples[samples.length - 1]?.time).toBe(120);
  });

  it("evicts samples outside the history window and respects the safety cap", () => {
    let samples: ReturnType<typeof sample>[] = [];

    for (let time = 0; time <= 300; time += 10) {
      samples = appendPointerSample(
        samples,
        sample(new THREE.Vector3(time, 0, 0), time),
        50,
        4,
      );
    }

    expect(samples).toHaveLength(4);
    expect(samples.map((entry) => entry.time)).toEqual([270, 280, 290, 300]);
  });

  it("estimates the same gesture across different pointer polling rates", () => {
    const dense = Array.from({ length: 21 }, (_, index) =>
      sample(new THREE.Vector3(index * 0.01, index * 0.005, 0), index * 5),
    );
    const sparse = Array.from({ length: 5 }, (_, index) =>
      sample(new THREE.Vector3(index * 0.05, index * 0.025, 0), index * 25),
    );

    const denseVelocity = getPointerGestureVelocity(dense);
    const sparseVelocity = getPointerGestureVelocity(sparse);

    expect(denseVelocity.x).toBeCloseTo(2, 5);
    expect(denseVelocity.y).toBeCloseTo(1, 5);
    expect(sparseVelocity.x).toBeCloseTo(denseVelocity.x, 5);
    expect(sparseVelocity.y).toBeCloseTo(denseVelocity.y, 5);
  });

  it("keeps a sub-frame down/up gesture finite and powerful", () => {
    const velocity = getPointerGestureVelocity([
      sample(new THREE.Vector3(0, 0, 0), 100),
      sample(new THREE.Vector3(0.16, 0.08, -0.12), 102),
    ]);

    expect(Object.values(velocity).every(Number.isFinite)).toBe(true);
    expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeGreaterThan(10);
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

  it("never brakes momentum that is already faster in the gesture direction", () => {
    const result = getReleaseImpulse(
      { x: 2, y: 1, z: 0 },
      { x: 8, y: 4, z: 0 },
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

  it("allows the keyboard throw to use its stronger dedicated impulse limits", () => {
    const target = {
      x: physicsConfig.throw.keyboard.forwardVelocity,
      y: physicsConfig.throw.keyboard.verticalVelocity,
      z: 0,
    };
    const current = { x: 0, y: 0, z: 0 };
    const pointerImpulse = getReleaseImpulse(target, current, 0.5);
    const keyboardImpulse = getReleaseImpulse(
      target,
      current,
      0.5,
      physicsConfig.throw.keyboard,
    );
    const pointerMagnitude = Math.hypot(
      pointerImpulse.x,
      pointerImpulse.y,
      pointerImpulse.z,
    );
    const keyboardMagnitude = Math.hypot(
      keyboardImpulse.x,
      keyboardImpulse.y,
      keyboardImpulse.z,
    );

    expect(keyboardMagnitude).toBeGreaterThan(pointerMagnitude * 2);
    expect(keyboardMagnitude).toBeLessThanOrEqual(
      physicsConfig.throw.keyboard.maxPointImpulse,
    );
  });
});

describe("getLimitedBodyMotion", () => {
  it("softly compresses inherited outliers while preserving their directions", () => {
    const result = getLimitedBodyMotion(
      { x: 30, y: 40, z: 0 },
      { x: 0, y: -24, z: 18 },
    );

    const linearSpeed = Math.hypot(
      result.linearVelocity.x,
      result.linearVelocity.y,
      result.linearVelocity.z,
    );
    const angularSpeed = Math.hypot(
      result.angularVelocity.x,
      result.angularVelocity.y,
      result.angularVelocity.z,
    );

    expect(linearSpeed).toBeGreaterThan(physicsConfig.throw.releaseLinearSoftLimit);
    expect(linearSpeed).toBeLessThan(physicsConfig.throw.maxReleaseLinearSpeed);
    expect(result.linearVelocity.x / result.linearVelocity.y).toBeCloseTo(30 / 40, 6);
    expect(angularSpeed).toBeGreaterThan(physicsConfig.throw.releaseAngularSoftLimit);
    expect(angularSpeed).toBeLessThan(30);
    expect(result.angularVelocity.y).toBeLessThan(0);
    expect(result.angularVelocity.z).toBeGreaterThan(0);
  });

  it("leaves motion below both safety limits unchanged", () => {
    expect(getLimitedBodyMotion(
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    )).toEqual({
      linearVelocity: { x: 1, y: 2, z: 3 },
      angularVelocity: { x: 4, y: 5, z: 6 },
    });
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
