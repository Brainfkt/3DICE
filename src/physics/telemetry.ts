import type { VectorComponents } from "./dicePhysics";

export type PhysicsDebugPhase =
  | "idle"
  | "drag"
  | "throw"
  | "settle"
  | "settled";

export type PhysicsDebugSampleKind =
  | "step"
  | "reset"
  | "grab"
  | "release"
  | "settled";

export type QuaternionComponents = VectorComponents & {
  w: number;
};

export type PhysicsMetricsSnapshot = {
  angularSpeed: number;
  angularVelocity: VectorComponents;
  atMs: number;
  candidateFace: number | null;
  finite: boolean;
  linearSpeed: number;
  linearVelocity: VectorComponents;
  nearlyStill: boolean;
  phase: PhysicsDebugPhase;
  position: VectorComponents;
  profileId: string;
  rotation: QuaternionComponents;
  sampleKind: PhysicsDebugSampleKind;
  settledFace: number | null;
  sleeping: boolean;
  throwId: number;
};

export type PhysicsMetricsInput = Omit<
  PhysicsMetricsSnapshot,
  "angularSpeed" | "finite" | "linearSpeed"
>;

export type PhysicsDebugReport = {
  current: PhysicsMetricsSnapshot | null;
  samples: PhysicsMetricsSnapshot[];
};

export type PhysicsDebugApi = {
  read: () => PhysicsDebugReport;
};

export type PhysicsDebugStore = PhysicsDebugApi & {
  publish: (snapshot: PhysicsMetricsSnapshot) => void;
  reset: () => void;
};

declare global {
  interface Window {
    __3dicePhysicsDebug?: PhysicsDebugApi;
  }
}

export const physicsTelemetryConfig = {
  maxStoredSamples: 720,
} as const;

function cloneVector(vector: VectorComponents): VectorComponents {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function cloneQuaternion(quaternion: QuaternionComponents): QuaternionComponents {
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function cloneSnapshot(snapshot: PhysicsMetricsSnapshot): PhysicsMetricsSnapshot {
  return {
    ...snapshot,
    angularVelocity: cloneVector(snapshot.angularVelocity),
    linearVelocity: cloneVector(snapshot.linearVelocity),
    position: cloneVector(snapshot.position),
    rotation: cloneQuaternion(snapshot.rotation),
  };
}

function vectorLength(vector: VectorComponents) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function isPhysicsDebugEnabled(search = "") {
  return new URLSearchParams(search).get("physicsDebug") === "1";
}

export function getPhysicsDebugPhase({
  dragging,
  hasActiveThrow,
  nearlyStill,
  settledFace,
}: {
  dragging: boolean;
  hasActiveThrow: boolean;
  nearlyStill: boolean;
  settledFace: number | null;
}): PhysicsDebugPhase {
  if (dragging) return "drag";
  if (settledFace !== null) return "settled";
  if (hasActiveThrow && nearlyStill) return "settle";
  if (hasActiveThrow) return "throw";
  return "idle";
}

export function createPhysicsMetricsSnapshot(
  input: PhysicsMetricsInput,
): PhysicsMetricsSnapshot {
  const angularVelocity = cloneVector(input.angularVelocity);
  const linearVelocity = cloneVector(input.linearVelocity);
  const position = cloneVector(input.position);
  const rotation = cloneQuaternion(input.rotation);
  const angularSpeed = vectorLength(angularVelocity);
  const linearSpeed = vectorLength(linearVelocity);
  const numericValues = [
    input.atMs,
    input.throwId,
    angularSpeed,
    linearSpeed,
    angularVelocity.x,
    angularVelocity.y,
    angularVelocity.z,
    linearVelocity.x,
    linearVelocity.y,
    linearVelocity.z,
    position.x,
    position.y,
    position.z,
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  ];

  return {
    ...input,
    angularSpeed,
    angularVelocity,
    finite: numericValues.every(Number.isFinite),
    linearSpeed,
    linearVelocity,
    position,
    rotation,
  };
}

export function createPhysicsDebugStore(
  maxStoredSamples: number = physicsTelemetryConfig.maxStoredSamples,
): PhysicsDebugStore {
  const sampleLimit = Math.max(Math.floor(maxStoredSamples), 1);
  let current: PhysicsMetricsSnapshot | null = null;
  const samples: PhysicsMetricsSnapshot[] = [];

  return {
    publish(snapshot) {
      current = cloneSnapshot(snapshot);
      samples.push(cloneSnapshot(snapshot));

      if (samples.length > sampleLimit) {
        samples.splice(0, samples.length - sampleLimit);
      }
    },
    read() {
      return {
        current: current ? cloneSnapshot(current) : null,
        samples: samples.map(cloneSnapshot),
      };
    },
    reset() {
      current = null;
      samples.length = 0;
    },
  };
}

export function exposePhysicsDebugStore(store: PhysicsDebugStore) {
  if (typeof window === "undefined") return () => undefined;

  const api: PhysicsDebugApi = {
    read: store.read,
  };
  window.__3dicePhysicsDebug = api;

  return () => {
    if (window.__3dicePhysicsDebug === api) {
      delete window.__3dicePhysicsDebug;
    }
  };
}
