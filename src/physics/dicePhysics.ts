import { RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { physicsConfig } from "./config";

export type PointerSample = {
  position: THREE.Vector3;
  time: number;
};

export type VectorComponents = {
  x: number;
  y: number;
  z: number;
};

export type DragTargetInput = {
  start: THREE.Vector3;
  rightAxis: THREE.Vector3;
  forwardAxis: THREE.Vector3;
  horizontalPixels: number;
  upwardPixels: number;
  worldUnitsPerPixel: number;
};

export type DragTargetClampInput = {
  point: THREE.Vector3;
  origin: THREE.Vector3;
  maxHorizontalDistance: number;
  minHeight: number;
};

export type SettleState = {
  stillFrames: number;
  stableFaceFrames: number;
  face: number | null;
  settledFace: number | null;
};

function clampVectorLength(vector: THREE.Vector3, maxLength: number) {
  const length = vector.length();
  if (length <= maxLength || length === 0) return vector;
  return vector.multiplyScalar(maxLength / length);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toVector3(vector: VectorComponents) {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

function toComponents(vector: THREE.Vector3): VectorComponents {
  return { x: vector.x, y: vector.y, z: vector.z };
}

export function getDragTargetFromPointerDelta({
  start,
  rightAxis,
  forwardAxis,
  horizontalPixels,
  upwardPixels,
  worldUnitsPerPixel,
}: DragTargetInput) {
  const liftPixels = Math.abs(upwardPixels);

  return start
    .clone()
    .addScaledVector(
      rightAxis,
      horizontalPixels * worldUnitsPerPixel * physicsConfig.drag.lateralGestureScale,
    )
    .addScaledVector(
      forwardAxis,
      upwardPixels * worldUnitsPerPixel * physicsConfig.drag.depthGestureScale,
    )
    .addScaledVector(
      new THREE.Vector3(0, 1, 0),
      liftPixels * worldUnitsPerPixel * physicsConfig.drag.verticalGestureScale,
    );
}

export function clampDragTargetToReach({
  point,
  origin,
  maxHorizontalDistance,
  minHeight,
}: DragTargetClampInput) {
  const horizontalOffset = new THREE.Vector2(point.x - origin.x, point.z - origin.z);

  if (horizontalOffset.length() > maxHorizontalDistance) {
    horizontalOffset.setLength(maxHorizontalDistance);
    point.x = origin.x + horizontalOffset.x;
    point.z = origin.z + horizontalOffset.y;
  }

  point.y = Math.max(point.y, minHeight);
  return point;
}

export function getThrowVectors(samples: PointerSample[]) {
  const fallback = {
    pointVelocity: { x: 0, y: physicsConfig.throw.verticalLift, z: 0 },
    wristTorqueImpulse: { x: 0, y: 0, z: 0 },
  };

  if (samples.length < 2) return fallback;

  const last = samples[samples.length - 1];
  const first = samples.find((sample) => last.time - sample.time <= 110) ?? samples[0];
  const deltaSeconds = Math.max((last.time - first.time) / 1000, 0.016);
  const gestureVelocity = last.position.clone().sub(first.position).divideScalar(deltaSeconds);
  const horizontalVelocity = new THREE.Vector3(
    gestureVelocity.x * physicsConfig.throw.velocityScale,
    0,
    gestureVelocity.z * physicsConfig.throw.velocityScale,
  );

  clampVectorLength(horizontalVelocity, physicsConfig.throw.maxHorizontalVelocity);

  const speed = horizontalVelocity.length();
  const lift = clampNumber(
    physicsConfig.throw.verticalLift +
      gestureVelocity.y * physicsConfig.throw.verticalGestureScale +
      Math.min(speed, physicsConfig.throw.speedLiftCap) * physicsConfig.throw.speedLift,
    physicsConfig.throw.minVerticalVelocity,
    physicsConfig.throw.maxVerticalVelocity,
  );
  const pointVelocity = horizontalVelocity.setY(lift);
  const wristTorqueImpulse = new THREE.Vector3(
    pointVelocity.z * physicsConfig.throw.wristTorqueImpulse,
    speed * physicsConfig.throw.tumbleTorqueImpulse,
    -pointVelocity.x * physicsConfig.throw.wristTorqueImpulse,
  );

  clampVectorLength(wristTorqueImpulse, physicsConfig.throw.maxWristTorqueImpulse);

  return {
    pointVelocity: toComponents(pointVelocity),
    wristTorqueImpulse: toComponents(wristTorqueImpulse),
  };
}

export function getPointVelocity(
  linearVelocity: VectorComponents,
  angularVelocity: VectorComponents,
  bodyCenter: VectorComponents,
  point: VectorComponents,
) {
  const radius = toVector3(point).sub(toVector3(bodyCenter));
  const angularContribution = new THREE.Vector3().crossVectors(
    toVector3(angularVelocity),
    radius,
  );

  return toComponents(toVector3(linearVelocity).add(angularContribution));
}

export function getReleaseImpulse(
  targetPointVelocity: VectorComponents,
  currentPointVelocity: VectorComponents,
  diceMass: number = physicsConfig.dice.mass,
) {
  const deltaVelocity = toVector3(targetPointVelocity).sub(toVector3(currentPointVelocity));

  clampVectorLength(deltaVelocity, physicsConfig.throw.maxPointSpeedDelta);

  const impulse = deltaVelocity.multiplyScalar(
    diceMass * physicsConfig.throw.pointImpulseScale,
  );

  clampVectorLength(impulse, physicsConfig.throw.maxPointImpulse);

  return toComponents(impulse);
}

export function isRigidBodyNearlyStill(body: RapierRigidBody) {
  const velocity = body.linvel();
  const angular = body.angvel();
  const linearSpeedSquared =
    velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
  const angularSpeedSquared =
    angular.x * angular.x + angular.y * angular.y + angular.z * angular.z;

  return (
    linearSpeedSquared <
      physicsConfig.settle.linearSpeedThreshold * physicsConfig.settle.linearSpeedThreshold &&
    angularSpeedSquared <
      physicsConfig.settle.angularSpeedThreshold * physicsConfig.settle.angularSpeedThreshold
  );
}

export function createSettleState(): SettleState {
  return {
    stillFrames: 0,
    stableFaceFrames: 0,
    face: null,
    settledFace: null,
  };
}

export function getNextSettleState(
  current: SettleState,
  isStill: boolean,
  face: number | null,
): SettleState {
  if (!isStill || face === null) {
    return createSettleState();
  }

  const stableFaceFrames =
    current.face === face ? current.stableFaceFrames + 1 : 1;
  const stillFrames = current.stillFrames + 1;
  const settledFace =
    stillFrames >= physicsConfig.settle.framesRequired &&
    stableFaceFrames >= physicsConfig.settle.stableFaceFramesRequired
      ? face
      : null;

  return {
    stillFrames,
    stableFaceFrames,
    face,
    settledFace,
  };
}
