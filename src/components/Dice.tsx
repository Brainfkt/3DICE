import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  RapierRigidBody,
  RigidBody,
  RoundCuboidCollider,
  useSphericalJoint,
} from "@react-three/rapier";
import { RoundedBox } from "@react-three/drei";
import {
  MutableRefObject,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { diceFaceDefinitions, detectDiceFace } from "../utils/detectDiceFace";
import { createFacePipLayout } from "../utils/dicePips";
import {
  clampDragTargetToReach,
  createSettleState,
  getDragTargetFromPointerDelta,
  getNextSettleState,
  getPointVelocity,
  getReleaseImpulse,
  getThrowVectors,
  isRigidBodyNearlyStill,
  PointerSample,
} from "../physics/dicePhysics";
import { PhysicsProfile, physicsConfig } from "../physics/config";
import { renderConfig } from "../render/config";
import { createIvoryRoughnessTexture } from "../render/ivoryTexture";

type DiceProps = {
  physicsProfile: PhysicsProfile;
  resetKey: number;
  onThrowStart: () => void;
  onSettle: (face: number) => void;
  trackedPosition?: MutableRefObject<THREE.Vector3>;
  isDraggingRef?: MutableRefObject<boolean>;
};

const DICE_SIZE = 1.12;
const HALF = DICE_SIZE / 2;
const PIP_FILL_RADIUS = 0.066;
const PIP_RECESS_INNER_RADIUS = 0.071;
const PIP_RECESS_OUTER_RADIUS = 0.098;
const PIP_OFFSET = 0.235;
const PIP_SURFACE_OFFSET = 0.0065;
const INITIAL_POSITION = new THREE.Vector3(0, HALF + 0.02, 0);
const INITIAL_ROTATION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.1, -0.28, 0.18),
);

const pipFillMaterial = new THREE.MeshStandardMaterial({
  color: "#030303",
  roughness: 0.82,
  metalness: 0,
  side: THREE.DoubleSide,
});

const pipRecessMaterial = new THREE.MeshStandardMaterial({
  color: "#2a261e",
  roughness: 0.95,
  metalness: 0,
  side: THREE.DoubleSide,
});

const pipFillGeometry = new THREE.CircleGeometry(PIP_FILL_RADIUS, 44);
const pipRecessGeometry = new THREE.RingGeometry(
  PIP_RECESS_INNER_RADIUS,
  PIP_RECESS_OUTER_RADIUS,
  44,
);
const ivoryRoughnessTexture = createIvoryRoughnessTexture(renderConfig.ivoryTexture);

const diceMaterial = new THREE.MeshPhysicalMaterial({
  color: "#efe7d3",
  roughness: 0.62,
  roughnessMap: ivoryRoughnessTexture,
  metalness: 0,
  clearcoat: 0.28,
  clearcoatRoughness: 0.72,
  sheen: 0.08,
});

function DicePips() {
  const fillRef = useRef<THREE.InstancedMesh>(null);
  const recessRef = useRef<THREE.InstancedMesh>(null);
  const transformHelper = useMemo(() => new THREE.Object3D(), []);
  const pipTransforms = useMemo(
    () =>
      diceFaceDefinitions.flatMap(({ value, localNormal }) =>
        createFacePipLayout(value, localNormal, HALF, PIP_OFFSET, PIP_SURFACE_OFFSET),
      ),
    [],
  );

  useLayoutEffect(() => {
    const fill = fillRef.current;
    const recess = recessRef.current;
    if (!fill || !recess) return;

    pipTransforms.forEach(({ position, quaternion }, index) => {
      transformHelper.position.copy(position);
      transformHelper.quaternion.copy(quaternion);
      transformHelper.scale.setScalar(1);
      transformHelper.updateMatrix();

      fill.setMatrixAt(index, transformHelper.matrix);
      recess.setMatrixAt(index, transformHelper.matrix);
    });

    fill.instanceMatrix.needsUpdate = true;
    recess.instanceMatrix.needsUpdate = true;
  }, [pipTransforms, transformHelper]);

  return (
    <>
      <instancedMesh
        ref={recessRef}
        args={[pipRecessGeometry, pipRecessMaterial, pipTransforms.length]}
        receiveShadow
      />
      <instancedMesh
        ref={fillRef}
        args={[pipFillGeometry, pipFillMaterial, pipTransforms.length]}
        receiveShadow
      />
    </>
  );
}

type DragJointProps = {
  anchorRef: RefObject<RapierRigidBody>;
  diceRef: RefObject<RapierRigidBody>;
  localAnchor: THREE.Vector3;
};

function DragJoint({ anchorRef, diceRef, localAnchor }: DragJointProps) {
  useSphericalJoint(anchorRef, diceRef, [
    [0, 0, 0],
    localAnchor.toArray() as [number, number, number],
  ]);

  return null;
}

type DragState = {
  id: number;
  localAnchor: THREE.Vector3;
};

export function Dice({
  physicsProfile,
  resetKey,
  onThrowStart,
  onSettle,
  trackedPosition,
  isDraggingRef,
}: DiceProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const anchorRef = useRef<RapierRigidBody>(null);
  const targetPosition = useRef(INITIAL_POSITION.clone());
  const dragStartPointer = useRef(new THREE.Vector2());
  const dragStartTarget = useRef(INITIAL_POSITION.clone());
  const dragRightAxis = useRef(new THREE.Vector3(1, 0, 0));
  const dragForwardAxis = useRef(new THREE.Vector3(0, 0, -1));
  const dragWorldUnitsPerPixel = useRef(0.01);
  const pointerSamples = useRef<PointerSample[]>([]);
  const grabbedLocalAnchor = useRef(new THREE.Vector3());
  const settleState = useRef(createSettleState());
  const hasActiveThrow = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragId = useRef(0);
  const { camera, gl } = useThree();

  const resetDice = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;

    body.setTranslation(INITIAL_POSITION, true);
    body.setRotation(INITIAL_ROTATION, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    targetPosition.current.copy(INITIAL_POSITION);
    anchorRef.current?.setTranslation(INITIAL_POSITION, true);
    trackedPosition?.current.copy(INITIAL_POSITION);
    if (isDraggingRef) {
      isDraggingRef.current = false;
    }
    settleState.current = createSettleState();
    hasActiveThrow.current = false;
    setIsDragging(false);
    setDragState(null);
  }, [isDraggingRef, trackedPosition]);

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

  useEffect(() => {
    resetDice();
  }, [resetDice, resetKey]);

  useEffect(() => {
    gl.domElement.style.cursor = isDragging ? "grabbing" : "grab";
    return () => {
      gl.domElement.style.cursor = "auto";
    };
  }, [gl.domElement, isDragging]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (event: PointerEvent) => {
      const hit = screenToDragPoint(event.clientX, event.clientY);
      targetPosition.current.copy(hit);
      pointerSamples.current.push({
        position: targetPosition.current.clone(),
        time: performance.now(),
      });
      pointerSamples.current = pointerSamples.current.slice(-6);
    };

    const handleUp = () => {
      const body = bodyRef.current;
      if (isDraggingRef) {
        isDraggingRef.current = false;
      }
      if (!body) return;

      const { pointVelocity, wristTorqueImpulse } = getThrowVectors(pointerSamples.current);
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
      const grabbedWorldPoint = grabbedLocalAnchor.current
        .clone()
        .applyQuaternion(bodyQuaternion)
        .add(bodyPosition);
      const currentPointVelocity = getPointVelocity(
        body.linvel(),
        body.angvel(),
        bodyPosition,
        grabbedWorldPoint,
      );
      const releaseImpulse = getReleaseImpulse(
        pointVelocity,
        currentPointVelocity,
        physicsProfile.dice.mass,
      );

      body.applyImpulseAtPoint(releaseImpulse, grabbedWorldPoint, true);
      body.applyTorqueImpulse(wristTorqueImpulse, true);
      settleState.current = createSettleState();
      hasActiveThrow.current = true;
      setDragState(null);
      setIsDragging(false);
      onThrowStart();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isDragging, isDraggingRef, onThrowStart, physicsProfile.dice.mass, screenToDragPoint]);

  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;

    const bodyTranslation = body.translation();
    trackedPosition?.current.set(bodyTranslation.x, bodyTranslation.y, bodyTranslation.z);

    if (isDragging) {
      anchorRef.current?.setNextKinematicTranslation(targetPosition.current);
      body.wakeUp();
      return;
    }

    if (!hasActiveThrow.current) return;

    const rotation = body.rotation();
    const isStill = isRigidBodyNearlyStill(body);
    settleState.current = getNextSettleState(
      settleState.current,
      isStill,
      detectDiceFace(rotation),
    );

    if (settleState.current.settledFace !== null) {
      hasActiveThrow.current = false;
      onSettle(settleState.current.settledFace);
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const body = bodyRef.current;
    const anchor = anchorRef.current;
    if (!body) return;
    if (isDraggingRef) {
      isDraggingRef.current = true;
    }

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
    grabbedLocalAnchor.current.copy(localAnchor);
    pointerSamples.current = [
      {
        position: targetPosition.current.clone(),
        time: performance.now(),
      },
    ];
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
    setDragState({ id: dragId.current, localAnchor });
    setIsDragging(true);
  };

  return (
    <>
      <RigidBody
        ref={anchorRef}
        type="kinematicPosition"
        colliders={false}
        position={INITIAL_POSITION.toArray()}
      />
      {dragState ? (
        <DragJoint
          key={dragState.id}
          anchorRef={anchorRef}
          diceRef={bodyRef}
          localAnchor={dragState.localAnchor}
        />
      ) : null}
      <RigidBody
        ref={bodyRef}
        colliders={false}
        mass={physicsProfile.dice.mass}
        linearDamping={physicsProfile.dice.linearDamping}
        angularDamping={physicsProfile.dice.angularDamping}
        canSleep={false}
        restitution={physicsProfile.dice.restitution}
        friction={physicsProfile.dice.friction}
        position={INITIAL_POSITION.toArray()}
        rotation={[0.1, -0.28, 0.18]}
      >
        <RoundCuboidCollider
          args={[
            physicsProfile.dice.colliderHalfExtent,
            physicsProfile.dice.colliderHalfExtent,
            physicsProfile.dice.colliderHalfExtent,
            physicsProfile.dice.colliderBorderRadius,
          ]}
          mass={physicsProfile.dice.mass}
          friction={physicsProfile.dice.friction}
          restitution={physicsProfile.dice.restitution}
        />
        <group onPointerDown={handlePointerDown}>
          <RoundedBox
            castShadow
            receiveShadow
            args={[DICE_SIZE, DICE_SIZE, DICE_SIZE]}
            radius={0.16}
            smoothness={18}
            material={diceMaterial}
          />
          <DicePips />
        </group>
      </RigidBody>
    </>
  );
}
