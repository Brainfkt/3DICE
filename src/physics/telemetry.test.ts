import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPhysicsDebugStore,
  createPhysicsMetricsSnapshot,
  exposePhysicsDebugStore,
  getPhysicsDebugPhase,
  isPhysicsDebugEnabled,
  PhysicsMetricsInput,
} from "./telemetry";

const baseInput: PhysicsMetricsInput = {
  angularVelocity: { x: 0, y: 0, z: 2 },
  atMs: 120,
  candidateFace: null,
  linearVelocity: { x: 3, y: 4, z: 0 },
  nearlyStill: false,
  phase: "throw",
  position: { x: 1, y: 2, z: 3 },
  profileId: "k",
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  sampleKind: "step",
  settledFace: null,
  sleeping: false,
  throwId: 4,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPhysicsDebugEnabled", () => {
  it("requires the explicit physicsDebug=1 query flag", () => {
    expect(isPhysicsDebugEnabled("?physicsDebug=1")).toBe(true);
    expect(isPhysicsDebugEnabled("?perf=1&physicsDebug=1&dpr=2")).toBe(true);
    expect(isPhysicsDebugEnabled("")).toBe(false);
    expect(isPhysicsDebugEnabled("?physicsDebug=0")).toBe(false);
    expect(isPhysicsDebugEnabled("?physicsDebug=true")).toBe(false);
    expect(isPhysicsDebugEnabled("?physicsdebug=1")).toBe(false);
  });
});

describe("getPhysicsDebugPhase", () => {
  it("derives phases from authoritative drag, throw and settle state", () => {
    expect(
      getPhysicsDebugPhase({
        dragging: false,
        hasActiveThrow: false,
        nearlyStill: false,
        settledFace: null,
      }),
    ).toBe("idle");
    expect(
      getPhysicsDebugPhase({
        dragging: true,
        hasActiveThrow: false,
        nearlyStill: false,
        settledFace: null,
      }),
    ).toBe("drag");
    expect(
      getPhysicsDebugPhase({
        dragging: false,
        hasActiveThrow: true,
        nearlyStill: false,
        settledFace: null,
      }),
    ).toBe("throw");
    expect(
      getPhysicsDebugPhase({
        dragging: false,
        hasActiveThrow: true,
        nearlyStill: true,
        settledFace: null,
      }),
    ).toBe("settle");
    expect(
      getPhysicsDebugPhase({
        dragging: false,
        hasActiveThrow: false,
        nearlyStill: true,
        settledFace: 5,
      }),
    ).toBe("settled");
  });
});

describe("physics debug snapshots", () => {
  it("computes speeds and copies mutable physics values", () => {
    const input = structuredClone(baseInput);
    const snapshot = createPhysicsMetricsSnapshot(input);

    input.linearVelocity.x = 99;
    input.rotation.w = 0;

    expect(snapshot.linearSpeed).toBe(5);
    expect(snapshot.angularSpeed).toBe(2);
    expect(snapshot.linearVelocity.x).toBe(3);
    expect(snapshot.rotation.w).toBe(1);
    expect(snapshot.finite).toBe(true);
  });

  it("flags non-finite body values", () => {
    const snapshot = createPhysicsMetricsSnapshot({
      ...baseInput,
      position: { x: Number.NaN, y: 0, z: 0 },
    });

    expect(snapshot.finite).toBe(false);
  });

  it("keeps a bounded chronological history with defensive reads", () => {
    const store = createPhysicsDebugStore(2);
    const first = createPhysicsMetricsSnapshot({ ...baseInput, atMs: 1 });
    const second = createPhysicsMetricsSnapshot({ ...baseInput, atMs: 2 });
    const third = createPhysicsMetricsSnapshot({ ...baseInput, atMs: 3 });

    store.publish(first);
    store.publish(second);
    store.publish(third);

    const report = store.read();
    report.current!.position.x = 100;
    report.samples[0].linearVelocity.x = 100;

    const reread = store.read();
    expect(reread.samples.map((sample) => sample.atMs)).toEqual([2, 3]);
    expect(reread.current?.atMs).toBe(3);
    expect(reread.current?.position.x).toBe(1);
    expect(reread.samples[0].linearVelocity.x).toBe(3);

    store.reset();
    expect(store.read()).toEqual({ current: null, samples: [] });
  });
});

describe("exposePhysicsDebugStore", () => {
  it("exposes a read-only API and only removes its own instance", () => {
    vi.stubGlobal("window", {});
    const store = createPhysicsDebugStore();
    store.publish(createPhysicsMetricsSnapshot(baseInput));

    const cleanup = exposePhysicsDebugStore(store);
    expect(window.__3dicePhysicsDebug?.read().current?.linearSpeed).toBe(5);
    expect(Object.keys(window.__3dicePhysicsDebug ?? {})).toEqual(["read"]);

    const replacement = { read: () => ({ current: null, samples: [] }) };
    window.__3dicePhysicsDebug = replacement;
    cleanup();

    expect(window.__3dicePhysicsDebug).toBe(replacement);
  });
});
