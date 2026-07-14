import { describe, expect, it } from "vitest";
import {
  defaultPhysicsProfileId,
  physicsConfig,
  physicsSimulationConfig,
  physicsProfileIds,
  physicsProfileOptions,
  physicsProfiles,
} from "./config";

describe("physicsProfiles", () => {
  it("keeps the default physicsConfig mapped to the selected profile", () => {
    expect(physicsConfig).toBe(physicsProfiles[defaultPhysicsProfileId]);
  });

  it("uses a fixed step and CCD for the fast-moving die", () => {
    expect(physicsSimulationConfig.fixedTimeStep).toBeCloseTo(1 / 120, 8);
    expect(physicsSimulationConfig.continuousCollisionDetection).toBe(true);
    expect(physicsSimulationConfig.maxCcdSubsteps).toBe(8);
    expect(physicsSimulationConfig.softCcdPrediction).toBeCloseTo(0.5);
    expect(physicsSimulationConfig.additionalSolverIterations).toBe(4);
    expect(physicsSimulationConfig.updatePriority).toBe(-100);
    expect(physicsConfig.throw.releaseLinearSoftLimit).toBeLessThan(
      physicsConfig.throw.maxReleaseLinearSpeed,
    );
    expect(physicsConfig.throw.releaseAngularSoftLimit).toBeLessThan(
      physicsConfig.throw.maxReleaseAngularSpeed,
    );
    expect(physicsConfig.throw.pointerSampleHistoryMs).toBeGreaterThanOrEqual(
      physicsConfig.throw.pointerSampleWindowMs,
    );
    expect(physicsConfig.throw.maxPointerSamples).toBeGreaterThan(6);
    expect(physicsConfig.dice.contactSkin).toBeCloseTo(0.01);
    expect(physicsConfig.throw.keyboard.verticalVelocity).toBeGreaterThan(
      physicsConfig.throw.keyboard.forwardVelocity,
    );
    expect(
      Math.hypot(
        physicsConfig.throw.keyboard.forwardVelocity,
        physicsConfig.throw.keyboard.verticalVelocity,
      ),
    ).toBeGreaterThan(23);
    expect(physicsConfig.throw.keyboard.maxPointSpeedDelta).toBeGreaterThan(
      Math.hypot(
        physicsConfig.throw.keyboard.forwardVelocity,
        physicsConfig.throw.keyboard.verticalVelocity,
        physicsConfig.throw.keyboard.lateralJitterVelocity,
      ) *
        (1 + physicsConfig.throw.keyboard.powerJitter),
    );
    expect(physicsConfig.throw.keyboard.forwardVelocity).toBeGreaterThan(20);
    expect(physicsConfig.throw.keyboard.maxReleaseLinearSpeed).toBe(36);
    expect(physicsConfig.throw.keyboard.maxReleaseAngularSpeed).toBe(18);
  });

  it("uses the selected K profile as the product default", () => {
    expect(defaultPhysicsProfileId).toBe("k");
    expect(physicsConfig).toBe(physicsProfiles.k);
  });

  it("offers compact unique labels for direct UI comparison", () => {
    const labels = physicsProfileOptions.map((profile) => profile.label);

    expect(physicsProfileOptions).toHaveLength(12);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("does not alter drag settings between drop presets", () => {
    const baseDrag = physicsProfiles.base.drag;

    for (const id of physicsProfileIds) {
      expect(physicsProfiles[id].drag).toBe(baseDrag);
    }
  });

  it("keeps every alternative lighter and under stronger gravity than the baseline", () => {
    for (const id of physicsProfileIds.filter((profileId) => profileId !== "base")) {
      expect(physicsProfiles[id].gravity[1]).toBeLessThan(physicsProfiles.base.gravity[1]);
      expect(physicsProfiles[id].dice.mass).toBeLessThan(physicsProfiles.base.dice.mass);
    }
  });

  it("keeps anti-float variants close to the preferred B/F/G families", () => {
    expect(physicsProfiles.i.gravity[1]).toBeLessThan(physicsProfiles.b.gravity[1]);
    expect(physicsProfiles.j.gravity[1]).toBeLessThan(physicsProfiles.f.gravity[1]);
    expect(physicsProfiles.k.gravity[1]).toBeLessThan(physicsProfiles.g.gravity[1]);
    expect(physicsProfiles.i.dice.mass).toBe(physicsProfiles.b.dice.mass);
    expect(physicsProfiles.j.dice.mass).toBe(physicsProfiles.f.dice.mass);
    expect(physicsProfiles.k.dice.mass).toBeLessThan(physicsProfiles.g.dice.mass);
    expect(physicsProfiles.k.dice.restitution).toBeGreaterThan(
      physicsProfiles.g.dice.restitution,
    );
  });
});
