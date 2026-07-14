import { ThreeEvent, useThree } from "@react-three/fiber";
import {
  ContactForcePayload,
  ConvexHullCollider,
  RapierRigidBody,
  RigidBody,
  RoundCuboidCollider,
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  useRapier,
  useSphericalJoint,
} from "@react-three/rapier";
import type { SphericalImpulseJoint } from "@dimforge/rapier3d-compat";
import {
  MutableRefObject,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
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
  getReleaseImpulse,
  getThrowVectors,
  isRigidBodyNearlyStill,
  PointerSample,
  ReleaseImpulseLimits,
  VectorComponents,
} from "../physics/dicePhysics";
import {
  PhysicsProfile,
  physicsConfig,
  physicsSimulationConfig,
} from "../physics/config";
import { renderConfig } from "../render/config";
import { createRecessedDiceGeometries } from "../render/diceGeometry";
import { createIvoryPbrTextures } from "../render/ivoryTexture";
import {
  createPhysicsDebugStore,
  createPhysicsMetricsSnapshot,
  exposePhysicsDebugStore,
  getPhysicsDebugPhase,
  PhysicsDebugSampleKind,
} from "../physics/telemetry";
import { DiceAppearance } from "../settings/config";
import { DiceTypeId } from "../settings/config";
import {
  detectDieFace,
  getPolyhedralDieDefinition,
} from "../render/polyhedralDice";

type DiceProps = {
  appearance: DiceAppearance;
  dieType: DiceTypeId;
  dragEnabled: boolean;
  initialPosition: [number, number, number];
  initialRotation: [number, number, number];
  keyboardThrowKey: number;
  keyboardThrowEnabled: boolean;
  parked: boolean;
  parkingAnchorRef: MutableRefObject<THREE.Vector3>;
  parkingOffset: [number, number, number];
  resetBeforeKeyboardThrow: boolean;
  throwPower: number;
  physicsDebugEnabled?: boolean;
  physicsProfile: PhysicsProfile;
  resetKey: number | string;
  onDragChange?: (isDragging: boolean) => void;
  onGrab?: () => void;
  onImpact?: (impact: { position: THREE.Vector3; strength: number }) => void;
  onThrowStart: () => void;
  onSettle: (face: number) => void;
  trackedPosition?: MutableRefObject<THREE.Vector3>;
  isDraggingRef?: MutableRefObject<boolean>;
};

const DICE_SIZE = 1.12;

const ivoryTextures = createIvoryPbrTextures(renderConfig.ivoryTexture);
const diceGeometries = createRecessedDiceGeometries({
  ...renderConfig.diceGeometry,
  size: DICE_SIZE,
});

type BodyMotionLimits = {
  releaseLinearSoftLimit: number;
  maxReleaseLinearSpeed: number;
  releaseAngularSoftLimit: number;
  maxReleaseAngularSpeed: number;
};

function limitBodyMotion(
  body: RapierRigidBody,
  limits: BodyMotionLimits = physicsConfig.throw,
) {
  const motion = getLimitedBodyMotion(
    body.linvel(),
    body.angvel(),
    limits.releaseLinearSoftLimit,
    limits.maxReleaseLinearSpeed,
    limits.releaseAngularSoftLimit,
    limits.maxReleaseAngularSpeed,
  );

  body.setLinvel(motion.linearVelocity, true);
  body.setAngvel(motion.angularVelocity, true);
  return motion;
}

type DragJointProps = {
  anchorRef: RefObject<RapierRigidBody>;
  diceRef: RefObject<RapierRigidBody>;
  jointRef: MutableRefObject<SphericalImpulseJoint | undefined>;
  localAnchor: THREE.Vector3;
};

function DragJoint({ anchorRef, diceRef, jointRef, localAnchor }: DragJointProps) {
  const joint = useSphericalJoint(anchorRef, diceRef, [
    [0, 0, 0],
    localAnchor.toArray() as [number, number, number],
  ]);

  useEffect(() => {
    const currentJoint = joint.current ?? undefined;
    jointRef.current = currentJoint;

    return () => {
      if (jointRef.current === currentJoint) {
        jointRef.current = undefined;
      }
    };
  }, [joint, jointRef]);

  return null;
}

type DragState = {
  id: number;
  localAnchor: THREE.Vector3;
};

export function Dice({
  appearance,
  dieType,
  dragEnabled,
  initialPosition,
  initialRotation,
  keyboardThrowKey,
  keyboardThrowEnabled,
  parked,
  parkingAnchorRef,
  parkingOffset,
  resetBeforeKeyboardThrow,
  throwPower,
  physicsDebugEnabled = false,
  physicsProfile,
  resetKey,
  onDragChange,
  onGrab,
  onImpact,
  onThrowStart,
  onSettle,
  trackedPosition,
  isDraggingRef,
}: DiceProps) {
  const initialPositionVector = useMemo(
    () => new THREE.Vector3(...initialPosition),
    [initialPosition],
  );
  const initialRotationQuaternion = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(...initialRotation)),
    [initialRotation],
  );
  const bodyRef = useRef<RapierRigidBody>(null);
  const anchorRef = useRef<RapierRigidBody>(null);
  const dragJointRef = useRef<SphericalImpulseJoint | undefined>(undefined);
  const targetPosition = useRef(initialPositionVector.clone());
  const dragStartPointer = useRef(new THREE.Vector2());
  const dragStartTarget = useRef(initialPositionVector.clone());
  const dragRightAxis = useRef(new THREE.Vector3(1, 0, 0));
  const dragForwardAxis = useRef(new THREE.Vector3(0, 0, -1));
  const dragWorldUnitsPerPixel = useRef(0.01);
  const pointerSamples = useRef<PointerSample[]>([]);
  const activePointerId = useRef<number | null>(null);
  const handledKeyboardThrowKey = useRef(keyboardThrowKey);
  const wasParkedRef = useRef(false);
  const preParkTransformRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  } | null>(null);
  const parkedWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const lastImpactAt = useRef(-Infinity);
  const dragTargetDirtyRef = useRef(false);
  const grabbedLocalAnchor = useRef(new THREE.Vector3());
  const settleState = useRef(createSettleState());
  const hasActiveThrow = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragId = useRef(0);
  const { camera, gl, invalidate } = useThree();
  const { world } = useRapier();
  const polyhedralDefinition = useMemo(
    () => getPolyhedralDieDefinition(dieType),
    [dieType],
  );
  const physicsDebugStore = useMemo(
    () => (physicsDebugEnabled ? createPhysicsDebugStore() : null),
    [physicsDebugEnabled],
  );
  const diceMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: appearance.bodyColor,
        map: ivoryTextures.map,
        roughness: appearance.roughness,
        roughnessMap: ivoryTextures.roughnessMap,
        normalMap: ivoryTextures.normalMap,
        normalScale: new THREE.Vector2(
          renderConfig.materials.dice.normalScale,
          renderConfig.materials.dice.normalScale,
        ),
        metalness: appearance.metalness,
        clearcoat: appearance.clearcoat,
        clearcoatRoughness: appearance.clearcoatRoughness,
        clearcoatNormalMap: ivoryTextures.normalMap,
        clearcoatNormalScale: new THREE.Vector2(
          renderConfig.materials.dice.clearcoatNormalScale,
          renderConfig.materials.dice.clearcoatNormalScale,
        ),
        ior: renderConfig.materials.dice.ior,
        specularIntensity: renderConfig.materials.dice.specularIntensity,
        sheen: 0,
        transmission: appearance.transmission,
        thickness: appearance.transmission > 0 ? 0.72 : 0,
        transparent: appearance.transmission > 0,
        opacity: appearance.transmission > 0 ? 0.9 : 1,
        flatShading: dieType !== "d6",
      }),
    [appearance, dieType],
  );
  const pipMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: appearance.pipColor,
        roughness: renderConfig.materials.pips.roughness,
        metalness: 0,
        clearcoat: renderConfig.materials.pips.clearcoat,
        clearcoatRoughness: renderConfig.materials.pips.clearcoatRoughness,
      }),
    [appearance.pipColor],
  );

  useEffect(
    () => () => {
      diceMaterial.dispose();
      pipMaterial.dispose();
    },
    [diceMaterial, pipMaterial],
  );

  const publishPhysicsDebugSnapshot = useCallback(
    (
      body: RapierRigidBody,
      sampleKind: PhysicsDebugSampleKind,
      atMs: number = performance.now(),
    ) => {
      if (!physicsDebugStore) return;

      const translation = body.translation();
      const rotation = body.rotation();
      const linearVelocity = body.linvel();
      const angularVelocity = body.angvel();
      const nearlyStill = isRigidBodyNearlyStill(body);
      const settledFace = settleState.current.settledFace;

      physicsDebugStore.publish(
        createPhysicsMetricsSnapshot({
          angularVelocity,
          atMs,
          candidateFace: settleState.current.face,
          linearVelocity,
          nearlyStill,
          phase: getPhysicsDebugPhase({
            dragging: activePointerId.current !== null,
            hasActiveThrow: hasActiveThrow.current,
            nearlyStill,
            settledFace,
          }),
          position: translation,
          profileId: physicsProfile.id,
          rotation,
          sampleKind,
          settledFace,
          sleeping: body.isSleeping(),
          throwId: dragId.current,
        }),
      );
    },
    [physicsDebugStore, physicsProfile.id],
  );

  useEffect(() => {
    if (!physicsDebugStore) return;
    return exposePhysicsDebugStore(physicsDebugStore);
  }, [physicsDebugStore]);

  useBeforePhysicsStep(() => {
    const body = bodyRef.current;
    if (
      !body ||
      activePointerId.current === null ||
      !dragTargetDirtyRef.current
    ) {
      return;
    }

    anchorRef.current?.setNextKinematicTranslation(targetPosition.current);
    dragTargetDirtyRef.current = false;
    body.wakeUp();
  });

  useAfterPhysicsStep(() => {
    const body = bodyRef.current;
    if (!body) return;

    const bodyTranslation = body.translation();
    trackedPosition?.current.set(
      bodyTranslation.x,
      bodyTranslation.y,
      bodyTranslation.z,
    );

    if (
      physicsDebugStore &&
      (activePointerId.current !== null || hasActiveThrow.current)
    ) {
      publishPhysicsDebugSnapshot(body, "step");
    }

    if (activePointerId.current !== null || !hasActiveThrow.current) return;

    const isStill = isRigidBodyNearlyStill(body);

    if (!isStill) {
      if (
        settleState.current.stillFrames !== 0 ||
        settleState.current.stableFaceFrames !== 0 ||
        settleState.current.face !== null
      ) {
        settleState.current = createSettleState();
      }
      return;
    }

    settleState.current = getNextSettleState(
      settleState.current,
      true,
      detectDieFace(dieType, body.rotation()),
    );

    const settledFace = settleState.current.settledFace;
    if (settledFace === null) return;

    hasActiveThrow.current = false;
    publishPhysicsDebugSnapshot(body, "settled");
    onSettle(settledFace);
  });

  const handleContactForce = useCallback(
    (event: ContactForcePayload) => {
      if (!hasActiveThrow.current || !onImpact) return;
      const now = performance.now();
      if (now - lastImpactAt.current < 58) return;

      const strength = THREE.MathUtils.clamp(
        Math.log1p(Math.max(event.totalForceMagnitude, 0)) / 6,
        0,
        1,
      );
      if (strength < 0.18) return;

      const body = bodyRef.current;
      if (!body) return;
      const translation = body.translation();
      lastImpactAt.current = now;
      onImpact({
        position: new THREE.Vector3(translation.x, 0.012, translation.z),
        strength,
      });
    },
    [onImpact],
  );

  const detachDragJoint = useCallback(() => {
    const joint = dragJointRef.current;
    if (!joint) return;

    if (world.getImpulseJoint(joint.handle)) {
      world.removeImpulseJoint(joint, true);
    }
    dragJointRef.current = undefined;
  }, [world]);

  const releasePointerCapture = useCallback(
    (pointerId: number) => {
      const element = gl.domElement;
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    },
    [gl.domElement],
  );

  const resetDice = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;

    body.setTranslation(initialPositionVector, true);
    body.setRotation(initialRotationQuaternion, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    detachDragJoint();
    targetPosition.current.copy(initialPositionVector);
    anchorRef.current?.setTranslation(initialPositionVector, true);
    trackedPosition?.current.copy(initialPositionVector);
    activePointerId.current = null;
    dragTargetDirtyRef.current = false;
    if (isDraggingRef) {
      isDraggingRef.current = false;
    }
    settleState.current = createSettleState();
    hasActiveThrow.current = false;
    wasParkedRef.current = false;
    preParkTransformRef.current = null;
    setIsDragging(false);
    setDragState(null);
    onDragChange?.(false);
    body.sleep();
    physicsDebugStore?.reset();
    publishPhysicsDebugSnapshot(body, "reset");
    invalidate();
  }, [
    detachDragJoint,
    invalidate,
    initialPositionVector,
    initialRotationQuaternion,
    isDraggingRef,
    onDragChange,
    physicsDebugStore,
    publishPhysicsDebugSnapshot,
    trackedPosition,
  ]);

  const clampDragTarget = useCallback((point: THREE.Vector3) => {
    return clampDragTargetToReach({
      point,
      origin: dragStartTarget.current,
      maxHorizontalDistance: physicsConfig.drag.maxAnchorDistance,
      minHeight: physicsConfig.drag.minAnchorHeight,
    });
  }, []);

  const configureDragGesture = useCallback(
    (clientX: number, clientY: number, startTarget: THREE.Vector3) => {
      const rect = gl.domElement.getBoundingClientRect();
      const rightAxis = dragRightAxis.current.setFromMatrixColumn(camera.matrixWorld, 0);
      const forwardAxis = camera.getWorldDirection(dragForwardAxis.current);

      rightAxis.y = 0;
      forwardAxis.y = 0;

      if (rightAxis.lengthSq() < 0.0001) {
        rightAxis.set(1, 0, 0);
      } else {
        rightAxis.normalize();
      }

      if (forwardAxis.lengthSq() < 0.0001) {
        forwardAxis.set(0, 0, -1);
      } else {
        forwardAxis.normalize();
      }

      const distance = Math.max(camera.position.distanceTo(startTarget), 0.001);
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 46;
      const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * distance;
      const worldUnitsPerPixel = visibleHeight / Math.max(rect.height, 1);

      dragStartPointer.current.set(clientX, clientY);
      dragStartTarget.current.copy(startTarget);
      dragWorldUnitsPerPixel.current = THREE.MathUtils.clamp(
        worldUnitsPerPixel,
        physicsConfig.drag.minWorldUnitsPerPixel,
        physicsConfig.drag.maxWorldUnitsPerPixel,
      );
    },
    [camera, gl.domElement],
  );

  const screenToDragPoint = useCallback(
    (clientX: number, clientY: number) => {
      const horizontalPixels = clientX - dragStartPointer.current.x;
      const upwardPixels = dragStartPointer.current.y - clientY;

      return clampDragTarget(
        getDragTargetFromPointerDelta({
          start: dragStartTarget.current,
          rightAxis: dragRightAxis.current,
          forwardAxis: dragForwardAxis.current,
          horizontalPixels,
          upwardPixels,
          worldUnitsPerPixel: dragWorldUnitsPerPixel.current,
        }),
      );
    },
    [clampDragTarget],
  );

  const recordPointerEvent = useCallback(
    (event: PointerEvent, includeCoalescedEvents: boolean) => {
      const coalescedEvents =
        includeCoalescedEvents && typeof event.getCoalescedEvents === "function"
          ? event.getCoalescedEvents()
          : [];

      const record = (pointerEvent: PointerEvent) => {
        const position = screenToDragPoint(
          pointerEvent.clientX,
          pointerEvent.clientY,
        );
        targetPosition.current.copy(position);
        pointerSamples.current = appendPointerSample(pointerSamples.current, {
          position,
          time: pointerEvent.timeStamp,
        });
      };

      for (const coalescedEvent of coalescedEvents) {
        record(coalescedEvent);
      }

      const lastCoalescedEvent = coalescedEvents[coalescedEvents.length - 1];
      if (
        !lastCoalescedEvent ||
        lastCoalescedEvent.timeStamp !== event.timeStamp ||
        lastCoalescedEvent.clientX !== event.clientX ||
        lastCoalescedEvent.clientY !== event.clientY
      ) {
        record(event);
      }

      dragTargetDirtyRef.current = true;
      invalidate();
    },
    [invalidate, screenToDragPoint],
  );

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      if (
        activePointerId.current === null ||
        event.pointerId !== activePointerId.current
      ) {
        return;
      }

      recordPointerEvent(event, true);
    },
    [recordPointerEvent],
  );

  const commitThrow = useCallback(
    (
      localImpulsePoint: THREE.Vector3,
      pointVelocity: VectorComponents,
      wristTorqueImpulse: VectorComponents,
      limits: BodyMotionLimits & ReleaseImpulseLimits = physicsConfig.throw,
    ) => {
      const body = bodyRef.current;
      if (!body) return false;

      const bodyTranslation = body.translation();
      const bodyRotation = body.rotation();
      const bodyPosition = new THREE.Vector3(
        bodyTranslation.x,
        bodyTranslation.y,
        bodyTranslation.z,
      );
      const bodyQuaternion = new THREE.Quaternion(
        bodyRotation.x,
        bodyRotation.y,
        bodyRotation.z,
        bodyRotation.w,
      );
      const worldImpulsePoint = localImpulsePoint
        .clone()
        .applyQuaternion(bodyQuaternion)
        .add(bodyPosition);
      const currentPointVelocity = getPointVelocity(
        body.linvel(),
        body.angvel(),
        bodyPosition,
        worldImpulsePoint,
      );
      const releaseImpulse = getReleaseImpulse(
        pointVelocity,
        currentPointVelocity,
        physicsProfile.dice.mass,
        limits,
      );

      body.applyImpulseAtPoint(releaseImpulse, worldImpulsePoint, true);
      body.applyTorqueImpulse(wristTorqueImpulse, true);
      limitBodyMotion(body, limits);
      settleState.current = createSettleState();
      hasActiveThrow.current = true;
      publishPhysicsDebugSnapshot(body, "release");
      setDragState(null);
      setIsDragging(false);
      onDragChange?.(false);
      onThrowStart();
      invalidate();
      return true;
    },
    [
      invalidate,
      onDragChange,
      onThrowStart,
      physicsProfile.dice.mass,
      publishPhysicsDebugSnapshot,
    ],
  );

  const handleWindowPointerUp = useCallback(
    (event: PointerEvent) => {
      if (
        activePointerId.current === null ||
        event.pointerId !== activePointerId.current
      ) {
        return;
      }

      if (event.type === "pointerup") {
        recordPointerEvent(event, false);
      } else {
        pointerSamples.current = appendPointerSample(pointerSamples.current, {
          position: targetPosition.current,
          time: event.timeStamp,
        });
      }

      activePointerId.current = null;
      dragTargetDirtyRef.current = false;
      releasePointerCapture(event.pointerId);
      detachDragJoint();

      const body = bodyRef.current;
      if (isDraggingRef) {
        isDraggingRef.current = false;
      }
      if (!body) {
        setDragState(null);
        setIsDragging(false);
        onDragChange?.(false);
        invalidate();
        return;
      }

      const { pointVelocity, wristTorqueImpulse } = getThrowVectors(pointerSamples.current);
      commitThrow(
        grabbedLocalAnchor.current,
        pointVelocity,
        wristTorqueImpulse,
      );
    },
    [
      commitThrow,
      detachDragJoint,
      isDraggingRef,
      invalidate,
      onDragChange,
      recordPointerEvent,
      releasePointerCapture,
    ],
  );

  const cancelActiveDrag = useCallback(() => {
    const pointerId = activePointerId.current;
    if (pointerId === null) return;

    activePointerId.current = null;
    dragTargetDirtyRef.current = false;
    releasePointerCapture(pointerId);
    detachDragJoint();

    if (isDraggingRef) {
      isDraggingRef.current = false;
    }

    setDragState(null);
    setIsDragging(false);

    const body = bodyRef.current;
    if (!body) {
      onDragChange?.(false);
      invalidate();
      return;
    }

    limitBodyMotion(body);
    settleState.current = createSettleState();
    hasActiveThrow.current = true;
    publishPhysicsDebugSnapshot(body, "release");
    onThrowStart();
    invalidate();
  }, [
    detachDragJoint,
    invalidate,
    isDraggingRef,
    onDragChange,
    onThrowStart,
    publishPhysicsDebugSnapshot,
    releasePointerCapture,
  ]);

  useEffect(() => {
    resetDice();
  }, [resetDice, resetKey]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    if (parked) {
      if (!wasParkedRef.current) {
        const translation = body.translation();
        const rotation = body.rotation();
        preParkTransformRef.current = {
          position: new THREE.Vector3(
            translation.x,
            translation.y,
            translation.z,
          ),
          rotation: new THREE.Quaternion(
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w,
          ),
        };
      }

      parkedWorldPosition.set(
        parkingAnchorRef.current.x + parkingOffset[0],
        preParkTransformRef.current?.position.y ?? parkingOffset[1],
        parkingAnchorRef.current.z + parkingOffset[2],
      );
      body.setTranslation(parkedWorldPosition, false);
      if (preParkTransformRef.current) {
        body.setRotation(preParkTransformRef.current.rotation, false);
      }
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      trackedPosition?.current.copy(parkedWorldPosition);
      hasActiveThrow.current = false;
      activePointerId.current = null;
      body.sleep();
      invalidate();
    } else if (wasParkedRef.current && preParkTransformRef.current) {
      const previous = preParkTransformRef.current;
      body.setTranslation(previous.position, true);
      body.setRotation(previous.rotation, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      trackedPosition?.current.copy(previous.position);
      body.sleep();
      invalidate();
      preParkTransformRef.current = null;
    }

    wasParkedRef.current = parked;
  }, [
    invalidate,
    parked,
    parkedWorldPosition,
    parkingAnchorRef,
    parkingOffset,
    trackedPosition,
  ]);

  useEffect(() => {
    gl.domElement.style.cursor = dragEnabled
      ? isDragging
        ? "grabbing"
        : "grab"
      : "default";
    return () => {
      gl.domElement.style.cursor = "auto";
    };
  }, [dragEnabled, gl.domElement, isDragging]);

  useEffect(() => {
    if (handledKeyboardThrowKey.current === keyboardThrowKey) return;
    handledKeyboardThrowKey.current = keyboardThrowKey;

    if (!keyboardThrowEnabled) return;
    if (resetBeforeKeyboardThrow) resetDice();
    if (activePointerId.current !== null || hasActiveThrow.current) return;

    const body = bodyRef.current;
    if (!body) return;

    body.recomputeMassPropertiesFromColliders();
    const forwardAxis = camera.getWorldDirection(new THREE.Vector3());
    const rightAxis = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const { pointVelocity, wristTorqueImpulse } = getKeyboardThrowVectors({
      forwardAxis,
      rightAxis,
      powerScale: throwPower,
    });
    const localKeyboardPoint = getLocalPointFromWorldOffset(
      {
        x: physicsConfig.throw.keyboard.worldImpulseOffset[0],
        y: physicsConfig.throw.keyboard.worldImpulseOffset[1],
        z: physicsConfig.throw.keyboard.worldImpulseOffset[2],
      },
      body.rotation(),
    );
    const keyboardPoint = new THREE.Vector3(
      localKeyboardPoint.x,
      localKeyboardPoint.y,
      localKeyboardPoint.z,
    );

    dragId.current += 1;
    commitThrow(
      keyboardPoint,
      pointVelocity,
      wristTorqueImpulse,
      physicsConfig.throw.keyboard,
    );
  }, [
    camera,
    commitThrow,
    keyboardThrowKey,
    keyboardThrowEnabled,
    resetBeforeKeyboardThrow,
    resetDice,
    throwPower,
  ]);

  useEffect(() => {
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", cancelActiveDrag);
    window.addEventListener("blur", cancelActiveDrag);
    gl.domElement.addEventListener("lostpointercapture", cancelActiveDrag);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelActiveDrag();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", cancelActiveDrag);
      window.removeEventListener("blur", cancelActiveDrag);
      gl.domElement.removeEventListener("lostpointercapture", cancelActiveDrag);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    cancelActiveDrag,
    gl.domElement,
    handleWindowPointerMove,
    handleWindowPointerUp,
  ]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (activePointerId.current !== null) return;

    const body = bodyRef.current;
    const anchor = anchorRef.current;
    if (!body) return;

    // React Three Rapier applies the collider mass after creation. Because the
    // world is paused at rest, synchronize it here so even a sub-frame first
    // flick uses the configured mass instead of the collider's default density.
    body.recomputeMassPropertiesFromColliders();

    if (isDraggingRef) {
      isDraggingRef.current = true;
    }
    activePointerId.current = event.nativeEvent.pointerId;
    gl.domElement.setPointerCapture(event.nativeEvent.pointerId);

    const grabPoint = event.point.clone();
    const grabWorldPoint = grabPoint.clone();

    configureDragGesture(event.nativeEvent.clientX, event.nativeEvent.clientY, grabWorldPoint);
    const hit = screenToDragPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);
    const bodyTranslation = body.translation();
    const bodyRotation = body.rotation();
    const bodyPosition = new THREE.Vector3(bodyTranslation.x, bodyTranslation.y, bodyTranslation.z);
    const bodyQuaternion = new THREE.Quaternion(
      bodyRotation.x,
      bodyRotation.y,
      bodyRotation.z,
      bodyRotation.w,
    );
    const localAnchor = grabPoint.sub(bodyPosition).applyQuaternion(bodyQuaternion.invert());

    targetPosition.current.copy(hit);
    anchor?.setTranslation(targetPosition.current, true);
    dragTargetDirtyRef.current = false;
    grabbedLocalAnchor.current.copy(localAnchor);
    pointerSamples.current = appendPointerSample([], {
      position: targetPosition.current,
      time: event.nativeEvent.timeStamp,
    });
    const currentLinear = body.linvel();
    const currentAngular = body.angvel();
    body.setLinvel(
      {
        x: currentLinear.x * physicsConfig.drag.catchLinearDamping,
        y: currentLinear.y * physicsConfig.drag.catchLinearDamping,
        z: currentLinear.z * physicsConfig.drag.catchLinearDamping,
      },
      true,
    );
    body.setAngvel(
      {
        x: currentAngular.x * physicsConfig.drag.catchAngularDamping,
        y: currentAngular.y * physicsConfig.drag.catchAngularDamping,
        z: currentAngular.z * physicsConfig.drag.catchAngularDamping,
      },
      true,
    );
    hasActiveThrow.current = false;
    settleState.current = createSettleState();
    dragId.current += 1;
    publishPhysicsDebugSnapshot(body, "grab");
    onGrab?.();
    onDragChange?.(true);
    setDragState({ id: dragId.current, localAnchor });
    setIsDragging(true);
    body.wakeUp();
    invalidate();
  };

  return (
    <>
      <RigidBody
        ref={anchorRef}
        type="kinematicPosition"
        colliders={false}
        position={initialPosition}
      />
      {dragState ? (
        <DragJoint
          key={dragState.id}
          anchorRef={anchorRef}
          diceRef={bodyRef}
          jointRef={dragJointRef}
          localAnchor={dragState.localAnchor}
        />
      ) : null}
      <RigidBody
        ref={bodyRef}
        additionalSolverIterations={
          physicsSimulationConfig.additionalSolverIterations
        }
        colliders={false}
        ccd={physicsSimulationConfig.continuousCollisionDetection}
        linearDamping={physicsProfile.dice.linearDamping}
        angularDamping={physicsProfile.dice.angularDamping}
        canSleep
        restitution={physicsProfile.dice.restitution}
        friction={physicsProfile.dice.friction}
        gravityScale={parked ? 0 : 1}
        softCcdPrediction={physicsSimulationConfig.softCcdPrediction}
        position={initialPosition}
        rotation={initialRotation}
        onContactForce={handleContactForce}
      >
        {polyhedralDefinition ? (
          <ConvexHullCollider
            args={[polyhedralDefinition.colliderVertices]}
            contactSkin={physicsProfile.dice.contactSkin}
            mass={physicsProfile.dice.mass}
            friction={physicsProfile.dice.friction}
            restitution={physicsProfile.dice.restitution}
            sensor={parked}
          />
        ) : (
          <RoundCuboidCollider
            args={[
              physicsProfile.dice.colliderHalfExtent,
              physicsProfile.dice.colliderHalfExtent,
              physicsProfile.dice.colliderHalfExtent,
              physicsProfile.dice.colliderBorderRadius,
            ]}
            contactSkin={physicsProfile.dice.contactSkin}
            mass={physicsProfile.dice.mass}
            friction={physicsProfile.dice.friction}
            restitution={physicsProfile.dice.restitution}
            sensor={parked}
          />
        )}
        <group onPointerDown={dragEnabled ? handlePointerDown : undefined}>
          {polyhedralDefinition ? (
            <>
              <mesh
                castShadow
                receiveShadow
                geometry={polyhedralDefinition.bodyGeometry}
                material={diceMaterial}
              />
              <mesh
                castShadow
                receiveShadow
                geometry={polyhedralDefinition.engravingGeometry}
                material={pipMaterial}
              />
            </>
          ) : (
            <>
              <mesh
                castShadow
                receiveShadow
                geometry={diceGeometries.body}
                material={diceMaterial}
              />
              <mesh
                castShadow
                receiveShadow
                geometry={diceGeometries.pips}
                material={pipMaterial}
              />
            </>
          )}
        </group>
      </RigidBody>
    </>
  );
}
