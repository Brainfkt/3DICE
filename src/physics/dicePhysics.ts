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

export type QuaternionComponents = VectorComponents & {
  w: number;
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

export type BodyMotion = {
  linearVelocity: VectorComponents;
  angularVelocity: VectorComponents;
};

export type KeyboardThrowInput = {
  forwardAxis: VectorComponents;
  rightAxis: VectorComponents;
  random?: () => number;
};

export type ReleaseImpulseLimits = {
  pointImpulseScale: number;
  maxPointSpeedDelta: number;
  maxPointImpulse: number;
};

function clampVectorLength(vector: THREE.Vector3, maxLength: number) {
  const length = vector.length();
  if (length <= maxLength || length === 0) return vector;
  return vector.multiplyScalar(maxLength / length);
}

function softLimitVectorLength(
  vector: THREE.Vector3,
  softLimit: number,
  maxLength: number,
) {
  const length = vector.length();
  const safeMaxLength = Math.max(maxLength, 0);
  const safeSoftLimit = clampNumber(softLimit, 0, safeMaxLength);

  if (length <= safeSoftLimit || length === 0) return vector;
  if (safeSoftLimit === safeMaxLength) {
    return clampVectorLength(vector, safeMaxLength);
  }

  const compressionRange = safeMaxLength - safeSoftLimit;
  const compressedLength =
    safeSoftLimit +
    compressionRange *
      (1 - Math.exp(-(length - safeSoftLimit) / compressionRange));

  return vector.multiplyScalar(compressedLength / length);
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

export function getLocalPointFromWorldOffset(
  worldOffset: VectorComponents,
  bodyRotation: QuaternionComponents,
) {
  const inverseBodyRotation = new THREE.Quaternion(
    bodyRotation.x,
    bodyRotation.y,
    bodyRotation.z,
    bodyRotation.w,
  ).normalize().invert();

  return toComponents(
    toVector3(worldOffset).applyQuaternion(inverseBodyRotation),
  );
}

export function appendPointerSample(
  samples: PointerSample[],
  sample: PointerSample,
  historyMs: number = physicsConfig.throw.pointerSampleHistoryMs,
  maxSamples: number = physicsConfig.throw.maxPointerSamples,
) {
  const previousTime = samples[samples.length - 1]?.time;
  const fallbackTime = previousTime ?? 0;
  const finiteTime = Number.isFinite(sample.time) ? sample.time : fallbackTime;
  const time = previousTime === undefined ? finiteTime : Math.max(finiteTime, previousTime);
  const cutoff = time - Math.max(historyMs, 0);
  const retained = samples.filter((entry) => entry.time >= cutoff);

  retained.push({
    position: sample.position.clone(),
    time,
  });

  return retained.slice(-Math.max(Math.floor(maxSamples), 1));
}

export function getPointerGestureVelocity(
  samples: PointerSample[],
  windowMs: number = physicsConfig.throw.pointerSampleWindowMs,
  minDurationMs: number = physicsConfig.throw.minPointerSampleDurationMs,
): VectorComponents {
  if (samples.length < 2) return { x: 0, y: 0, z: 0 };

  const last = samples[samples.length - 1];
  const firstRecentIndex = samples.findIndex(
    (sample) => last.time - sample.time <= windowMs,
  );
  const recent = samples.slice(Math.max(firstRecentIndex, 0));

  if (recent.length < 2) return { x: 0, y: 0, z: 0 };

  const meanTime =
    recent.reduce((sum, sample) => sum + (sample.time - last.time) / 1000, 0) /
    recent.length;
  const meanPosition = recent.reduce(
    (sum, sample) => sum.add(sample.position),
    new THREE.Vector3(),
  ).multiplyScalar(1 / recent.length);
  const velocity = new THREE.Vector3();
  let timeVariance = 0;

  for (const sample of recent) {
    const centeredTime = (sample.time - last.time) / 1000 - meanTime;
    timeVariance += centeredTime * centeredTime;
    velocity.addScaledVector(sample.position.clone().sub(meanPosition), centeredTime);
  }

  const durationMs = Math.max(last.time - recent[0].time, 0);

  if (timeVariance > Number.EPSILON) {
    velocity.multiplyScalar(1 / timeVariance);

    if (durationMs < minDurationMs) {
      velocity.multiplyScalar(durationMs / Math.max(minDurationMs, Number.EPSILON));
    }

    return toComponents(velocity);
  }

  const fallbackDurationSeconds = Math.max(durationMs, minDurationMs) / 1000;
  return toComponents(
    last.position
      .clone()
      .sub(recent[0].position)
      .divideScalar(Math.max(fallbackDurationSeconds, Number.EPSILON)),
  );
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

  const gestureVelocity = toVector3(getPointerGestureVelocity(samples));
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

export function getKeyboardThrowVectors({
  forwardAxis,
  rightAxis,
  random = Math.random,
}: KeyboardThrowInput) {
  const keyboard = physicsConfig.throw.keyboard;
  const forward = toVector3(forwardAxis).setY(0);
  const right = toVector3(rightAxis).setY(0);

  if (forward.lengthSq() < Number.EPSILON) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }

  right.addScaledVector(forward, -right.dot(forward));
  if (right.lengthSq() < Number.EPSILON) {
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
  }
  right.normalize();

  const lateralSample = clampNumber(random(), 0, 1) * 2 - 1;
  const powerSample = clampNumber(random(), 0, 1) * 2 - 1;
  const spinDirection = random() < 0.5 ? -1 : 1;
  const power = 1 + powerSample * keyboard.powerJitter;
  const pointVelocity = forward
    .multiplyScalar(keyboard.forwardVelocity)
    .addScaledVector(right, lateralSample * keyboard.lateralJitterVelocity)
    .setY(keyboard.verticalVelocity)
    .multiplyScalar(power);
  const horizontalSpeed = Math.hypot(pointVelocity.x, pointVelocity.z);
  const wristTorqueImpulse = new THREE.Vector3(
    pointVelocity.z * physicsConfig.throw.wristTorqueImpulse,
    horizontalSpeed * physicsConfig.throw.tumbleTorqueImpulse * spinDirection,
    -pointVelocity.x * physicsConfig.throw.wristTorqueImpulse,
  );

  clampVectorLength(
    wristTorqueImpulse,
    physicsConfig.throw.maxWristTorqueImpulse,
  );

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
  limits: ReleaseImpulseLimits = physicsConfig.throw,
) {
  const targetVelocity = toVector3(targetPointVelocity);
  const targetSpeed = targetVelocity.length();

  if (targetSpeed === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const targetDirection = targetVelocity.multiplyScalar(1 / targetSpeed);
  const currentSpeedAlongGesture = toVector3(currentPointVelocity).dot(targetDirection);
  const missingSpeed = Math.max(targetSpeed - currentSpeedAlongGesture, 0);
  const deltaVelocity = targetDirection.multiplyScalar(missingSpeed);

  clampVectorLength(deltaVelocity, limits.maxPointSpeedDelta);

  const impulse = deltaVelocity.multiplyScalar(
    diceMass * limits.pointImpulseScale,
  );

  clampVectorLength(impulse, limits.maxPointImpulse);

  return toComponents(impulse);
}

export function getLimitedBodyMotion(
  linearVelocity: VectorComponents,
  angularVelocity: VectorComponents,
  linearSoftLimit: number = physicsConfig.throw.releaseLinearSoftLimit,
  maxLinearSpeed: number = physicsConfig.throw.maxReleaseLinearSpeed,
  angularSoftLimit: number = physicsConfig.throw.releaseAngularSoftLimit,
  maxAngularSpeed: number = physicsConfig.throw.maxReleaseAngularSpeed,
): BodyMotion {
  const linear = softLimitVectorLength(
    toVector3(linearVelocity),
    linearSoftLimit,
    maxLinearSpeed,
  );
  const angular = softLimitVectorLength(
    toVector3(angularVelocity),
    angularSoftLimit,
    maxAngularSpeed,
  );

  return {
    linearVelocity: toComponents(linear),
    angularVelocity: toComponents(angular),
  };
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
