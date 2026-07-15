import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import {
  physicsConfig,
  physicsSimulationConfig,
  physicsWorldConfig,
} from "./config";

function createDieCollider() {
  return RAPIER.ColliderDesc.roundCuboid(
    physicsConfig.dice.colliderHalfExtent,
    physicsConfig.dice.colliderHalfExtent,
    physicsConfig.dice.colliderHalfExtent,
    physicsConfig.dice.colliderBorderRadius,
  )
    .setMass(physicsConfig.dice.mass)
    .setFriction(physicsConfig.dice.friction)
    .setRestitution(physicsConfig.dice.restitution)
    .setContactSkin(physicsConfig.dice.contactSkin);
}

describe("locked die collisions", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("keeps the locked pose fixed while stopping a fast incoming die", () => {
    const world = new RAPIER.World({ x: 0, y: physicsConfig.gravity[1], z: 0 });
    world.timestep = physicsSimulationConfig.fixedTimeStep;
    world.integrationParameters.maxCcdSubsteps =
      physicsSimulationConfig.maxCcdSubsteps;
    const queue = new RAPIER.EventQueue(true);

    try {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          12,
          physicsConfig.floor.colliderHalfHeight,
          12,
        )
          .setTranslation(0, -physicsConfig.floor.colliderHalfHeight, 0)
          .setFriction(physicsConfig.floor.friction)
          .setRestitution(physicsConfig.floor.restitution),
      );

      const height = physicsWorldConfig.diceInitialPosition[1];
      const lockedBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, height, 0),
      );
      world.createCollider(createDieCollider(), lockedBody);

      const incomingBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(-3.5, height, 0)
          .setCcdEnabled(physicsSimulationConfig.continuousCollisionDetection)
          .setSoftCcdPrediction(physicsSimulationConfig.softCcdPrediction)
          .setAdditionalSolverIterations(
            physicsSimulationConfig.additionalSolverIterations,
          ),
      );
      world.createCollider(
        createDieCollider().setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS,
        ),
        incomingBody,
      );
      incomingBody.setLinvel({ x: 20, y: 0, z: 0 }, true);

      let collisionStarted = false;
      let maximumIncomingX = -Infinity;

      for (let step = 0; step < 120; step += 1) {
        world.step(queue);
        queue.drainCollisionEvents((_, __, started) => {
          collisionStarted ||= started;
        });
        maximumIncomingX = Math.max(
          maximumIncomingX,
          incomingBody.translation().x,
        );
      }

      expect(collisionStarted).toBe(true);
      expect(maximumIncomingX).toBeLessThan(0);
      const lockedPosition = lockedBody.translation();
      const lockedRotation = lockedBody.rotation();
      expect(lockedPosition.x).toBeCloseTo(0, 7);
      expect(lockedPosition.y).toBeCloseTo(height, 7);
      expect(lockedPosition.z).toBeCloseTo(0, 7);
      expect(lockedRotation.x).toBeCloseTo(0, 7);
      expect(lockedRotation.y).toBeCloseTo(0, 7);
      expect(lockedRotation.z).toBeCloseTo(0, 7);
      expect(lockedRotation.w).toBeCloseTo(1, 7);
    } finally {
      queue.free();
      world.free();
    }
  });
});
