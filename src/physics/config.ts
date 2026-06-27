const sharedThrow = {
  velocityScale: 0.18,
  verticalLift: 0.94,
  verticalGestureScale: 0.52,
  speedLift: 0.1,
  speedLiftCap: 6,
  minVerticalVelocity: 0.32,
  maxHorizontalVelocity: 5.2,
  maxVerticalVelocity: 4.3,
  pointImpulseScale: 0.88,
  maxPointSpeedDelta: 6.5,
  maxPointImpulse: 3.2,
  wristTorqueImpulse: 0.12,
  tumbleTorqueImpulse: 0.07,
  maxWristTorqueImpulse: 0.72,
} as const;

const sharedDrag = {
  minAnchorHeight: 0.18,
  maxAnchorDistance: 6.8,
  minWorldUnitsPerPixel: 0.006,
  maxWorldUnitsPerPixel: 0.018,
  lateralGestureScale: 0.86,
  depthGestureScale: 0.78,
  verticalGestureScale: 0.46,
  catchLinearDamping: 0.28,
  catchAngularDamping: 0.5,
} as const;

const sharedSettle = {
  linearSpeedThreshold: 0.055,
  angularSpeedThreshold: 0.13,
  framesRequired: 44,
  stableFaceFramesRequired: 18,
} as const;

const sharedFloorBounds = {
  colliderHalfHeight: 0.08,
  halfExtent: 7.2,
  wallHeight: 5.6,
  wallThickness: 0.38,
  ceilingHalfHeight: 0.14,
  boundaryPulseDuration: 0.38,
} as const;

const sharedCollider = {
  colliderHalfExtent: 0.49,
  colliderBorderRadius: 0.06,
} as const;

export const physicsProfiles = {
  base: {
    id: "base",
    label: "0",
    name: "Actuel",
    gravity: [0, -38, 0] as [number, number, number],
    dice: {
      mass: 0.62,
      friction: 0.96,
      restitution: 0.18,
      linearDamping: 0.34,
      angularDamping: 0.18,
      ...sharedCollider,
    },
    floor: {
      friction: 0.92,
      restitution: 0.14,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  a: {
    id: "a",
    label: "A",
    name: "Gravite nette",
    gravity: [0, -44, 0] as [number, number, number],
    dice: {
      mass: 0.56,
      friction: 0.9,
      restitution: 0.22,
      linearDamping: 0.28,
      angularDamping: 0.13,
      ...sharedCollider,
    },
    floor: {
      friction: 0.86,
      restitution: 0.16,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  b: {
    id: "b",
    label: "B",
    name: "Leger vif",
    gravity: [0, -46, 0] as [number, number, number],
    dice: {
      mass: 0.5,
      friction: 0.84,
      restitution: 0.26,
      linearDamping: 0.24,
      angularDamping: 0.1,
      ...sharedCollider,
    },
    floor: {
      friction: 0.8,
      restitution: 0.19,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  c: {
    id: "c",
    label: "C",
    name: "Roule plus",
    gravity: [0, -42, 0] as [number, number, number],
    dice: {
      mass: 0.54,
      friction: 1.02,
      restitution: 0.2,
      linearDamping: 0.25,
      angularDamping: 0.08,
      ...sharedCollider,
    },
    floor: {
      friction: 0.96,
      restitution: 0.15,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  d: {
    id: "d",
    label: "D",
    name: "Rebond plus",
    gravity: [0, -48, 0] as [number, number, number],
    dice: {
      mass: 0.5,
      friction: 0.86,
      restitution: 0.31,
      linearDamping: 0.23,
      angularDamping: 0.1,
      ...sharedCollider,
    },
    floor: {
      friction: 0.82,
      restitution: 0.24,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  e: {
    id: "e",
    label: "E",
    name: "Sec rapide",
    gravity: [0, -50, 0] as [number, number, number],
    dice: {
      mass: 0.52,
      friction: 0.94,
      restitution: 0.23,
      linearDamping: 0.22,
      angularDamping: 0.09,
      ...sharedCollider,
    },
    floor: {
      friction: 0.9,
      restitution: 0.18,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  f: {
    id: "f",
    label: "F",
    name: "Gravite forte",
    gravity: [0, -54, 0] as [number, number, number],
    dice: {
      mass: 0.48,
      friction: 0.88,
      restitution: 0.26,
      linearDamping: 0.22,
      angularDamping: 0.09,
      ...sharedCollider,
    },
    floor: {
      friction: 0.86,
      restitution: 0.2,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  g: {
    id: "g",
    label: "G",
    name: "Libre",
    gravity: [0, -45, 0] as [number, number, number],
    dice: {
      mass: 0.5,
      friction: 0.78,
      restitution: 0.28,
      linearDamping: 0.18,
      angularDamping: 0.06,
      ...sharedCollider,
    },
    floor: {
      friction: 0.74,
      restitution: 0.21,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  h: {
    id: "h",
    label: "H",
    name: "Casino leger",
    gravity: [0, -52, 0] as [number, number, number],
    dice: {
      mass: 0.46,
      friction: 0.92,
      restitution: 0.34,
      linearDamping: 0.2,
      angularDamping: 0.07,
      ...sharedCollider,
    },
    floor: {
      friction: 0.88,
      restitution: 0.26,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  i: {
    id: "i",
    label: "I",
    name: "B plus sol",
    gravity: [0, -56, 0] as [number, number, number],
    dice: {
      mass: 0.5,
      friction: 0.84,
      restitution: 0.24,
      linearDamping: 0.21,
      angularDamping: 0.085,
      ...sharedCollider,
    },
    floor: {
      friction: 0.8,
      restitution: 0.18,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  j: {
    id: "j",
    label: "J",
    name: "F sec sol",
    gravity: [0, -62, 0] as [number, number, number],
    dice: {
      mass: 0.48,
      friction: 0.88,
      restitution: 0.23,
      linearDamping: 0.2,
      angularDamping: 0.08,
      ...sharedCollider,
    },
    floor: {
      friction: 0.86,
      restitution: 0.18,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
  k: {
    id: "k",
    label: "K",
    name: "G roule sol",
    gravity: [0, -58, 0] as [number, number, number],
    dice: {
      mass: 0.5,
      friction: 0.76,
      restitution: 0.25,
      linearDamping: 0.16,
      angularDamping: 0.055,
      ...sharedCollider,
    },
    floor: {
      friction: 0.72,
      restitution: 0.19,
      ...sharedFloorBounds,
    },
    throw: sharedThrow,
    drag: sharedDrag,
    settle: sharedSettle,
  },
} as const;

export type PhysicsProfileId = keyof typeof physicsProfiles;
export type PhysicsProfile = (typeof physicsProfiles)[PhysicsProfileId];

export const defaultPhysicsProfileId: PhysicsProfileId = "k";
export const physicsProfileIds = Object.keys(physicsProfiles) as PhysicsProfileId[];
export const physicsProfileOptions = physicsProfileIds.map((id) => physicsProfiles[id]);

export const physicsConfig = physicsProfiles[defaultPhysicsProfileId];

export function getPhysicsProfile(id: PhysicsProfileId) {
  return physicsProfiles[id];
}
