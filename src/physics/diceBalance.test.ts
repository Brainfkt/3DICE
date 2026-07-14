import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import {
  physicsConfig,
  physicsSimulationConfig,
  physicsWorldConfig,
} from "./config";
import {
  createSettleState,
  getKeyboardThrowVectors,
  getLimitedBodyMotion,
  getLocalPointFromWorldOffset,
  getNextSettleState,
  getPointVelocity,
  getReleaseImpulse,
  isRigidBodyNearlyStill,
} from "./dicePhysics";
import { detectDiceFace } from "../utils/detectDiceFace";
import { renderConfig } from "../render/config";

const THROW_COUNT = 1_000;
const FACE_COUNT = 6;
const EXPECTED_COUNT = THROW_COUNT / FACE_COUNT;
// Five degrees of freedom at alpha=1%. Combined with the per-face bound below,
// this rejects roughly 5% of genuinely uniform 1,000-throw samples.
const CHI_SQUARED_99_PERCENT = 15.086;
const MAX_COUNT_DEVIATION = 31;
const BALANCE_SEED = 0x3d1ce;
const MAX_SETTLE_STEPS = 3_600;

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function getChiSquared(counts: readonly number[]) {
  return counts.reduce(
    (sum, count) => sum + (count - EXPECTED_COUNT) ** 2 / EXPECTED_COUNT,
    0,
  );
}

function createBalanceWorld() {
  const world = new RAPIER.World({
    x: physicsConfig.gravity[0],
    y: physicsConfig.gravity[1],
    z: physicsConfig.gravity[2],
  });
  world.timestep = physicsSimulationConfig.fixedTimeStep;
  world.integrationParameters.maxCcdSubsteps =
    physicsSimulationConfig.maxCcdSubsteps;

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(
      physicsWorldConfig.openWorldHalfExtent,
      physicsConfig.floor.colliderHalfHeight,
      physicsWorldConfig.openWorldHalfExtent,
    )
      .setTranslation(0, -physicsConfig.floor.colliderHalfHeight, 0)
      .setFriction(physicsConfig.floor.friction)
      .setRestitution(physicsConfig.floor.restitution),
  );

  const initialRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...physicsWorldConfig.diceInitialRotationEuler),
  );
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...physicsWorldConfig.diceInitialPosition)
      .setRotation(initialRotation)
      .setLinearDamping(physicsConfig.dice.linearDamping)
      .setAngularDamping(physicsConfig.dice.angularDamping)
      .setCanSleep(true)
      .setCcdEnabled(physicsSimulationConfig.continuousCollisionDetection)
      .setSoftCcdPrediction(physicsSimulationConfig.softCcdPrediction)
      .setAdditionalSolverIterations(
        physicsSimulationConfig.additionalSolverIterations,
      ),
  );

  world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(
      physicsConfig.dice.colliderHalfExtent,
      physicsConfig.dice.colliderHalfExtent,
      physicsConfig.dice.colliderHalfExtent,
      physicsConfig.dice.colliderBorderRadius,
    )
      .setMass(physicsConfig.dice.mass)
      .setFriction(physicsConfig.dice.friction)
      .setRestitution(physicsConfig.dice.restitution)
      .setContactSkin(physicsConfig.dice.contactSkin),
    body,
  );

  return { body, world };
}

function stepUntilSettled(world: RAPIER.World, body: RAPIER.RigidBody) {
  let settleState = createSettleState();

  for (let step = 0; step < MAX_SETTLE_STEPS; step += 1) {
    world.step();
    const isStill = isRigidBodyNearlyStill(body);
    settleState = getNextSettleState(
      settleState,
      isStill,
      isStill ? detectDiceFace(body.rotation()) : null,
    );

    if (settleState.settledFace !== null) {
      return settleState.settledFace;
    }
  }

  throw new Error(
    `The die did not settle within ${MAX_SETTLE_STEPS} fixed physics steps.`,
  );
}

function throwWithSpacePhysics(
  body: RAPIER.RigidBody,
  random: () => number,
) {
  body.recomputeMassPropertiesFromColliders();

  const forwardAxis = new THREE.Vector3(...renderConfig.camera.lookAt)
    .sub(new THREE.Vector3(...renderConfig.camera.position))
    .setY(0)
    .normalize();
  const rightAxis = new THREE.Vector3().crossVectors(
    forwardAxis,
    new THREE.Vector3(0, 1, 0),
  );
  const { pointVelocity, wristTorqueImpulse } = getKeyboardThrowVectors({
    forwardAxis,
    rightAxis,
    random,
  });
  const center = body.translation();
  const rotation = body.rotation();
  const localImpulsePoint = getLocalPointFromWorldOffset(
    {
      x: physicsConfig.throw.keyboard.worldImpulseOffset[0],
      y: physicsConfig.throw.keyboard.worldImpulseOffset[1],
      z: physicsConfig.throw.keyboard.worldImpulseOffset[2],
    },
    rotation,
  );
  const worldImpulsePoint = new THREE.Vector3(
    localImpulsePoint.x,
    localImpulsePoint.y,
    localImpulsePoint.z,
  )
    .applyQuaternion(
      new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
    )
    .add(new THREE.Vector3(center.x, center.y, center.z));
  const currentPointVelocity = getPointVelocity(
    body.linvel(),
    body.angvel(),
    center,
    worldImpulsePoint,
  );
  const impulse = getReleaseImpulse(
    pointVelocity,
    currentPointVelocity,
    physicsConfig.dice.mass,
    physicsConfig.throw.keyboard,
  );

  body.applyImpulseAtPoint(impulse, worldImpulsePoint, true);
  body.applyTorqueImpulse(wristTorqueImpulse, true);

  const limitedMotion = getLimitedBodyMotion(
    body.linvel(),
    body.angvel(),
    physicsConfig.throw.keyboard.releaseLinearSoftLimit,
    physicsConfig.throw.keyboard.maxReleaseLinearSpeed,
    physicsConfig.throw.keyboard.releaseAngularSoftLimit,
    physicsConfig.throw.keyboard.maxReleaseAngularSpeed,
  );
  body.setLinvel(limitedMotion.linearVelocity, true);
  body.setAngvel(limitedMotion.angularVelocity, true);
}

describe("1,000-throw physical balance", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it(
    "keeps all six faces statistically compatible with an even die",
    () => {
      const random = createSeededRandom(BALANCE_SEED);
      const counts = Array.from({ length: FACE_COUNT }, () => 0);
      const { body, world } = createBalanceWorld();

      try {
        for (let throwIndex = 0; throwIndex < THROW_COUNT; throwIndex += 1) {
          throwWithSpacePhysics(body, random);
          const face = stepUntilSettled(world, body);
          counts[face - 1] += 1;

          const settledPosition = body.translation();
          body.setTranslation(
            { x: 0, y: settledPosition.y, z: 0 },
            false,
          );
          world.propagateModifiedBodyPositionsToColliders();
        }
      } finally {
        world.free();
      }

      const chiSquared = getChiSquared(counts);
      const maxDeviation = Math.max(
        ...counts.map((count) => Math.abs(count - EXPECTED_COUNT)),
      );
      const distribution = counts
        .map((count, index) => `${index + 1}:${count}`)
        .join(" ");
      const report =
        `seed=${BALANCE_SEED} throws=${THROW_COUNT} ${distribution} ` +
        `chi2=${chiSquared.toFixed(2)} maxDeviation=${maxDeviation.toFixed(2)}`;

      console.info(`[dice-balance] ${report}`);
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(THROW_COUNT);
      expect(chiSquared, report).toBeLessThanOrEqual(CHI_SQUARED_99_PERCENT);
      expect(maxDeviation, report).toBeLessThanOrEqual(MAX_COUNT_DEVIATION);
    },
    240_000,
  );
});
