import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  PerspectiveCamera,
} from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import * as THREE from "three";
import {
  MutableRefObject,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dice } from "./Dice";
import { Floor } from "./Floor";
import { TopViewBounds } from "./TopViewBounds";
import {
  getDiceInitialTransforms,
  PhysicsProfile,
  physicsSimulationConfig,
  physicsWorldConfig,
} from "../physics/config";
import { isPhysicsDebugEnabled } from "../physics/telemetry";
import { renderConfig } from "../render/config";
import {
  getRenderDprSetting,
  isRenderPerfEnabled,
  publishRenderMetrics,
} from "../render/performance";
import {
  LightSourceConfig,
  setLightPosition,
} from "../render/lighting";
import {
  DiceAppearance,
  CameraViewId,
  DiceCount,
  DiceTypeId,
  LightingPreset,
  SurfaceTheme,
} from "../settings/config";
import {
  getTopViewLayout,
  getTopViewThrowPlans,
  TopViewThrowPlan,
} from "../game/topView";
import { getDieInitialHeight } from "../render/polyhedralDice";
import {
  getDiceSpaceThrowMode,
  getSpaceThrowKeyAction,
  getTouchThrowTapAction,
  SPACE_THROW_BLOCKED_TARGET_SELECTOR,
} from "../input/keyboardThrow";

type SceneProps = {
  advancedMode: boolean;
  autoRecenterEnabled: boolean;
  cameraGesturesEnabled: boolean;
  cameraView: CameraViewId;
  diceAppearance: DiceAppearance;
  diceCount: DiceCount;
  diceType: DiceTypeId;
  impactEffectsEnabled: boolean;
  lightingPreset: LightingPreset;
  lockedDice: readonly boolean[];
  physicsProfile: PhysicsProfile;
  resetKey: number;
  surface: SurfaceTheme;
  throwPower: number;
  onGrab: (diceIndex: number) => void;
  onImpact: (diceIndex: number, strength: number) => void;
  onThrowStart: (diceIndex: number) => void;
  onSettle: (diceIndex: number, face: number) => void;
};

type SceneActivity = {
  active: boolean;
  epoch: string;
};

type DiceTransform = ReturnType<typeof getDiceInitialTransforms>[number];

const BASE_CAMERA_POSITION = new THREE.Vector3(
  ...renderConfig.camera.position,
);
const BASE_LOOK_AT = new THREE.Vector3(...renderConfig.camera.lookAt);
const BASE_CAMERA_OFFSET = BASE_CAMERA_POSITION.clone().sub(BASE_LOOK_AT);
const BASE_CAMERA_FORWARD_HORIZONTAL = BASE_LOOK_AT.clone()
  .sub(BASE_CAMERA_POSITION)
  .setY(0)
  .normalize();
const BASE_CAMERA_RIGHT_HORIZONTAL = new THREE.Vector3()
  .crossVectors(BASE_CAMERA_FORWARD_HORIZONTAL, new THREE.Vector3(0, 1, 0))
  .normalize();
const FREE_CAMERA_UP = new THREE.Vector3(0, 1, 0);
const TOP_VIEW_LOOK_AT = new THREE.Vector3(
  ...renderConfig.camera.topView.lookAt,
);
const TOP_VIEW_UP = new THREE.Vector3(...renderConfig.camera.topView.up);
const LOCKED_DICE_SIDE_DISTANCE = 3.35;
const LOCKED_DICE_MIN_SIDE_DISTANCE = 1.5;
const LOCKED_DICE_MIN_SPACING = 1.22;
const MIN_CAMERA_ZOOM = 0.62;
const MAX_CAMERA_ZOOM = 2.4;
const AUTO_ZOOM_MAX = 2.15;
const AUTO_ZOOM_START_DISTANCE = 1.45;
const AUTO_ZOOM_PER_UNIT = 0.065;
const GROUP_ZOOM_START_RADIUS = 1.15;
const GROUP_ZOOM_PER_UNIT = 0.17;
const CAMERA_ZOOM_SPEED = 5.8;
const CAMERA_LOOK_SPEED = 10.5;
const CAMERA_CATCHUP_PER_UNIT = 1.05;
const CAMERA_MAX_LOOK_SPEED = 34;
const CAMERA_POSITION_SPEED = 8.4;
const CAMERA_POSITION_CATCHUP_PER_UNIT = 0.85;
const CAMERA_MAX_POSITION_SPEED = 26;
const CAMERA_POSITION_SETTLE_EPSILON = 0.001;
const CAMERA_LOOK_SETTLE_EPSILON = 0.001;
const CAMERA_ZOOM_SETTLE_EPSILON = 0.0005;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCurrentSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getViewportAspect() {
  return typeof window === "undefined" || window.innerHeight <= 0
    ? 1
    : window.innerWidth / window.innerHeight;
}

function ActiveFrameDriver({ active }: { active: boolean }) {
  const clock = useThree((state) => state.clock);
  const invalidate = useThree((state) => state.invalidate);
  const wasActive = useRef(false);

  useLayoutEffect(() => {
    if (active && !wasActive.current) {
      // Demand rendering lets the shared clock age while the scene sleeps.
      // Consume that stale delta before Rapier's first fixed-step frame.
      clock.getDelta();
      invalidate();
    }

    wasActive.current = active;
  }, [active, clock, invalidate]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // A background tab can suspend RAF for seconds. Stopping the clock
        // makes its first delta after resume equal to zero instead of 0.5s.
        clock.stop();
      } else if (active) {
        invalidate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, clock, invalidate]);

  useFrame(() => {
    if (active) invalidate();
  }, physicsSimulationConfig.updatePriority - 1);

  return null;
}

type TouchTapStart = {
  atMs: number;
  maxDistancePx: number;
  pointerId: number;
  x: number;
  y: number;
};

function TouchThrowControl({
  isDiceDraggingRef,
  onTap,
}: {
  isDiceDraggingRef: MutableRefObject<boolean>;
  onTap: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const tapStartRef = useRef<TouchTapStart | null>(null);

  useEffect(() => {
    const element = gl.domElement;
    const getDistance = (event: PointerEvent, start: TouchTapStart) =>
      Math.hypot(event.clientX - start.x, event.clientY - start.y);

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      if (!event.isPrimary) {
        tapStartRef.current = null;
        return;
      }

      tapStartRef.current = {
        atMs: event.timeStamp,
        maxDistancePx: 0,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const start = tapStartRef.current;
      if (!start || event.pointerId !== start.pointerId) return;
      start.maxDistancePx = Math.max(
        start.maxDistancePx,
        getDistance(event, start),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const start = tapStartRef.current;
      tapStartRef.current = null;
      if (!start || event.pointerId !== start.pointerId) return;

      const action = getTouchThrowTapAction({
        distancePx: Math.max(start.maxDistancePx, getDistance(event, start)),
        durationMs: event.timeStamp - start.atMs,
        isDiceDragging: isDiceDraggingRef.current,
        isPrimary: event.isPrimary,
        pointerType: event.pointerType,
      });

      if (action === "throw") onTap();
    };

    const cancelTap = () => {
      tapStartRef.current = null;
    };

    element.addEventListener("pointerdown", handlePointerDown, { passive: true });
    element.addEventListener("pointermove", handlePointerMove, { passive: true });
    element.addEventListener("pointerup", handlePointerUp, { passive: true });
    element.addEventListener("pointercancel", cancelTap, { passive: true });

    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerUp);
      element.removeEventListener("pointercancel", cancelTap);
    };
  }, [gl.domElement, isDiceDraggingRef, onTap]);

  return null;
}

type CameraRigProps = {
  cameraView: CameraViewId;
  dicePositionRef: MutableRefObject<THREE.Vector3>;
  diceSpreadRef: MutableRefObject<number>;
  gesturesEnabled: boolean;
  isDiceDraggingRef: MutableRefObject<boolean>;
  recenterKey: number;
  resetKey: number | string;
};

function CameraRig({
  cameraView,
  dicePositionRef,
  diceSpreadRef,
  gesturesEnabled,
  isDiceDraggingRef,
  recenterKey,
  resetKey,
}: CameraRigProps) {
  const { camera, gl, invalidate, size } = useThree();
  const topViewLayout = useMemo(
    () => getTopViewLayout(size.width / Math.max(size.height, 1)),
    [size.height, size.width],
  );
  const lookAtRef = useRef(BASE_LOOK_AT.clone());
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const desiredLookAt = useMemo(() => new THREE.Vector3(), []);
  const lookAtDelta = useMemo(() => new THREE.Vector3(), []);
  const orbitOffset = useMemo(() => new THREE.Vector3(), []);
  const baseSpherical = useMemo(
    () => new THREE.Spherical().setFromVector3(BASE_CAMERA_OFFSET),
    [],
  );
  const desiredSpherical = useMemo(() => new THREE.Spherical(), []);
  const zoomTarget = useRef(1);
  const zoomCurrent = useRef(1);
  const pinchPointers = useRef(new Map<number, THREE.Vector2>());
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(1);
  const orbitYaw = useRef(0);
  const orbitPitch = useRef(0);
  const rotatePointer = useRef<{
    id: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const element = gl.domElement;

    const getPinchDistance = () => {
      const points = Array.from(pinchPointers.current.values());
      return points.length >= 2 ? points[0].distanceTo(points[1]) : 0;
    };

    const startPinch = () => {
      pinchStartDistance.current = getPinchDistance();
      pinchStartZoom.current = zoomTarget.current;
    };

    const handleWheel = (event: WheelEvent) => {
      if (cameraView !== "free") return;
      event.preventDefault();
      zoomTarget.current = clampNumber(
        zoomTarget.current * Math.exp(event.deltaY * 0.001),
        MIN_CAMERA_ZOOM,
        MAX_CAMERA_ZOOM,
      );
      invalidate();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (cameraView !== "free" || !gesturesEnabled) return;
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      pinchPointers.current.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (pinchPointers.current.size === 2) {
        rotatePointer.current = null;
        startPinch();
      } else if (pinchPointers.current.size === 1) {
        rotatePointer.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = pinchPointers.current.get(event.pointerId);
      if (!point) return;

      const previousX = point.x;
      const previousY = point.y;
      point.set(event.clientX, event.clientY);
      if (pinchPointers.current.size === 1) {
        const rotating = rotatePointer.current;
        if (
          rotating?.id === event.pointerId &&
          !isDiceDraggingRef.current
        ) {
          orbitYaw.current -= (event.clientX - previousX) * 0.006;
          orbitPitch.current = clampNumber(
            orbitPitch.current + (event.clientY - previousY) * 0.0045,
            -0.52,
            0.38,
          );
          rotating.x = event.clientX;
          rotating.y = event.clientY;
          invalidate();
        }
        return;
      }

      if (pinchPointers.current.size !== 2 || pinchStartDistance.current <= 0) return;

      const ratio = getPinchDistance() / pinchStartDistance.current;
      zoomTarget.current = clampNumber(
        pinchStartZoom.current / Math.max(ratio, 0.01),
        MIN_CAMERA_ZOOM,
        MAX_CAMERA_ZOOM,
      );
      invalidate();
    };

    const handlePointerUp = (event: PointerEvent) => {
      pinchPointers.current.delete(event.pointerId);
      if (rotatePointer.current?.id === event.pointerId) {
        rotatePointer.current = null;
      }
      if (pinchPointers.current.size < 2) {
        pinchStartDistance.current = 0;
        const remaining = Array.from(pinchPointers.current.entries())[0];
        if (remaining) {
          rotatePointer.current = {
            id: remaining[0],
            x: remaining[1].x,
            y: remaining[1].y,
          };
        }
      } else {
        startPinch();
      }
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    element.addEventListener("pointerdown", handlePointerDown, { passive: true });
    element.addEventListener("pointermove", handlePointerMove, { passive: true });
    element.addEventListener("pointerup", handlePointerUp, { passive: true });
    element.addEventListener("pointercancel", handlePointerUp, { passive: true });
    element.addEventListener("pointerleave", handlePointerUp, { passive: true });

    return () => {
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerUp);
      element.removeEventListener("pointercancel", handlePointerUp);
      element.removeEventListener("pointerleave", handlePointerUp);
    };
  }, [
    cameraView,
    gesturesEnabled,
    gl.domElement,
    invalidate,
    isDiceDraggingRef,
  ]);

  useEffect(() => {
    if (cameraView !== "free") return;
    lookAtRef.current.copy(BASE_LOOK_AT);
    desiredLookAt.copy(BASE_LOOK_AT);
    desiredPosition.copy(BASE_CAMERA_POSITION);
    zoomTarget.current = 1;
    zoomCurrent.current = 1;
    pinchPointers.current.clear();
    pinchStartDistance.current = 0;
    pinchStartZoom.current = 1;
    orbitYaw.current = 0;
    orbitPitch.current = 0;
    rotatePointer.current = null;
    camera.up.copy(FREE_CAMERA_UP);
    camera.position.copy(BASE_CAMERA_POSITION);
    camera.lookAt(lookAtRef.current);
    camera.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    cameraView,
    desiredLookAt,
    desiredPosition,
    invalidate,
    resetKey,
  ]);

  useEffect(() => {
    if (cameraView !== "top") return;
    lookAtRef.current.copy(TOP_VIEW_LOOK_AT);
    desiredLookAt.copy(TOP_VIEW_LOOK_AT);
    desiredPosition.set(...topViewLayout.cameraPosition);
    zoomTarget.current = 1;
    zoomCurrent.current = 1;
    pinchPointers.current.clear();
    pinchStartDistance.current = 0;
    pinchStartZoom.current = 1;
    orbitYaw.current = 0;
    orbitPitch.current = 0;
    rotatePointer.current = null;
    camera.up.copy(TOP_VIEW_UP);
    camera.position.copy(desiredPosition);
    camera.lookAt(TOP_VIEW_LOOK_AT);
    camera.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    cameraView,
    desiredLookAt,
    desiredPosition,
    invalidate,
    resetKey,
    topViewLayout.cameraPosition,
  ]);

  useEffect(() => {
    if (cameraView !== "free" || recenterKey === 0) return;
    const dicePosition = dicePositionRef.current;
    lookAtRef.current.set(dicePosition.x, BASE_LOOK_AT.y, dicePosition.z);
    desiredLookAt.copy(lookAtRef.current);
    // Recenter the subject after a remote throw while preserving the user's
    // deliberate zoom and orbit. Only an explicit Reset restores those.
    invalidate();
  }, [
    cameraView,
    desiredLookAt,
    dicePositionRef,
    invalidate,
    recenterKey,
  ]);

  useFrame((_, delta) => {
    if (cameraView === "top") return;
    const safeDelta = Math.min(delta, 1 / 30);
    const dicePosition = dicePositionRef.current;
    const diceHeightLift =
      Math.min(
        Math.max(
          dicePosition.y - physicsWorldConfig.diceInitialPosition[1],
          0,
        ),
        2.2,
      ) * 0.18;
    desiredLookAt.set(dicePosition.x, BASE_LOOK_AT.y + diceHeightLift, dicePosition.z);

    const lookAtLag = lookAtRef.current.distanceTo(desiredLookAt);
    const followAutoZoom = clampNumber(
      1 + Math.max(lookAtLag - AUTO_ZOOM_START_DISTANCE, 0) * AUTO_ZOOM_PER_UNIT,
      1,
      AUTO_ZOOM_MAX,
    );
    const groupAutoZoom = clampNumber(
      1 +
        Math.max(diceSpreadRef.current - GROUP_ZOOM_START_RADIUS, 0) *
          GROUP_ZOOM_PER_UNIT *
          clampNumber(size.height / Math.max(size.width, 1), 1, 2.2),
      1,
      AUTO_ZOOM_MAX,
    );
    const autoZoom = Math.max(followAutoZoom, groupAutoZoom);

    const desiredZoom = clampNumber(
      zoomTarget.current * autoZoom,
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM,
    );

    zoomCurrent.current = THREE.MathUtils.damp(
      zoomCurrent.current,
      desiredZoom,
      CAMERA_ZOOM_SPEED,
      safeDelta,
    );

    lookAtDelta.copy(desiredLookAt).sub(lookAtRef.current);

    if (lookAtLag > 0.001) {
      const maxLookStep =
        clampNumber(
          CAMERA_LOOK_SPEED + lookAtLag * CAMERA_CATCHUP_PER_UNIT,
          CAMERA_LOOK_SPEED,
          CAMERA_MAX_LOOK_SPEED,
        ) * safeDelta;

      lookAtRef.current.add(
        lookAtDelta.multiplyScalar(Math.min(maxLookStep / lookAtLag, 1)),
      );
    }

    desiredSpherical.set(
      baseSpherical.radius,
      clampNumber(baseSpherical.phi + orbitPitch.current, 0.38, Math.PI - 0.38),
      baseSpherical.theta + orbitYaw.current,
    );
    orbitOffset.setFromSpherical(desiredSpherical);
    desiredPosition
      .copy(lookAtRef.current)
      .addScaledVector(orbitOffset, zoomCurrent.current);

    const positionLag = camera.position.distanceTo(desiredPosition);
    const positionSpeed = clampNumber(
      CAMERA_POSITION_SPEED + positionLag * CAMERA_POSITION_CATCHUP_PER_UNIT,
      CAMERA_POSITION_SPEED,
      CAMERA_MAX_POSITION_SPEED,
    );

    camera.position.lerp(
      desiredPosition,
      1 - Math.exp(-safeDelta * positionSpeed),
    );
    camera.lookAt(lookAtRef.current);

    if (
      lookAtRef.current.distanceTo(desiredLookAt) > CAMERA_LOOK_SETTLE_EPSILON ||
      camera.position.distanceTo(desiredPosition) > CAMERA_POSITION_SETTLE_EPSILON ||
      Math.abs(zoomCurrent.current - desiredZoom) > CAMERA_ZOOM_SETTLE_EPSILON
    ) {
      invalidate();
    }
  });

  return null;
}

type StudioLightsProps = {
  dicePositionRef: MutableRefObject<THREE.Vector3>;
  preset: LightingPreset;
};

type SpotRigProps = {
  dicePositionRef: MutableRefObject<THREE.Vector3>;
  source: LightSourceConfig;
};

function SpotRig({ dicePositionRef, source }: SpotRigProps) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = target;
      invalidate();
    }
  }, [invalidate, target]);

  useFrame(() => {
    const dicePosition = dicePositionRef.current;

    target.position.set(dicePosition.x, 0.24, dicePosition.z);
    target.updateMatrixWorld();

    if (!lightRef.current) return;

    setLightPosition(dicePosition, source, lightRef.current.position);
  });

  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={lightRef}
        angle={source.angle}
        castShadow={source.castShadow}
        color={source.color}
        decay={source.decay}
        distance={source.distance}
        intensity={source.intensity}
        penumbra={source.penumbra}
        position={source.offset}
        shadow-bias={source.shadow?.bias}
        shadow-camera-far={source.shadow?.far}
        shadow-camera-near={source.shadow?.near}
        shadow-intensity={source.shadow?.intensity}
        shadow-mapSize={[source.shadow?.mapSize ?? 1024, source.shadow?.mapSize ?? 1024]}
        shadow-normalBias={source.shadow?.normalBias}
        shadow-radius={source.shadow?.radius}
      />
    </>
  );
}

function PointRig({
  dicePositionRef,
  source,
}: {
  dicePositionRef: MutableRefObject<THREE.Vector3>;
  source: LightSourceConfig;
}) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;

    setLightPosition(dicePositionRef.current, source, light.position);
  });

  return (
    <pointLight
      ref={lightRef}
      castShadow={source.castShadow}
      color={source.color}
      decay={source.decay}
      distance={source.distance}
      intensity={source.intensity}
      position={source.offset}
    />
  );
}

function StudioLights({ dicePositionRef, preset }: StudioLightsProps) {
  return (
    <>
      {renderConfig.lighting.sources.map((baseSource) => {
        const source = {
          ...baseSource,
          color: preset.keyColor,
          intensity: preset.keyIntensity,
        } satisfies LightSourceConfig;
        return source.kind === "spot" ? (
          <SpotRig key={source.id} dicePositionRef={dicePositionRef} source={source} />
        ) : (
          <PointRig key={source.id} dicePositionRef={dicePositionRef} source={source} />
        );
      })}
    </>
  );
}

const StudioEnvironment = memo(function StudioEnvironment({
  preset,
}: {
  preset: LightingPreset;
}) {
  return (
    <Environment
      key={preset.id}
      background={false}
      environmentIntensity={preset.environmentIntensity}
      frames={1}
      resolution={renderConfig.lighting.environmentResolution}
    >
      <color
        attach="background"
        args={[renderConfig.lighting.environmentBackground]}
      />
      {renderConfig.lighting.lightformers.map((lightformer) => (
        <Lightformer
          key={lightformer.id}
          color={
            lightformer.id === "warm-key-card"
              ? preset.keyColor
              : preset.warmth > 0
                ? "#ffe0bd"
                : preset.warmth < 0
                  ? "#b5d7ff"
                  : lightformer.color
          }
          form="rect"
          intensity={lightformer.intensity}
          position={lightformer.position}
          scale={lightformer.scale}
          target={lightformer.target}
        />
      ))}
    </Environment>
  );
});

function ToneMappingController({ preset }: { preset: LightingPreset }) {
  const { gl, invalidate } = useThree();

  useLayoutEffect(() => {
    gl.toneMappingExposure = preset.toneMappingExposure;
    invalidate();
  }, [gl, invalidate, preset.toneMappingExposure]);

  return null;
}

function ShadowMapController({
  dynamic,
  staticKey,
}: {
  dynamic: boolean;
  staticKey: number;
}) {
  const { gl, invalidate } = useThree();

  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = dynamic;
    gl.shadowMap.needsUpdate = true;
    invalidate();

    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [dynamic, gl, invalidate, staticKey]);

  return null;
}

function FollowContactShadows({
  dicePositionRef,
  dynamic,
  scale,
  staticKey,
}: {
  dicePositionRef: MutableRefObject<THREE.Vector3>;
  dynamic: boolean;
  scale: number;
  staticKey: number;
}) {
  const shadowRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const group = shadowRef.current;
    if (!group) return;

    group.position.set(
      dicePositionRef.current.x,
      renderConfig.shadows.floorY,
      dicePositionRef.current.z,
    );
  });

  return (
    <ContactShadows
      ref={shadowRef}
      blur={renderConfig.shadows.contactBlur}
      color="#030302"
      far={renderConfig.shadows.contactFar}
      frames={dynamic ? 0 : 1}
      name={`contact-shadow-${staticKey}`}
      opacity={renderConfig.shadows.contactOpacity}
      position={[0, renderConfig.shadows.floorY, 0]}
      resolution={renderConfig.shadows.contactResolution}
      scale={scale}
      smooth
      visible={!dynamic}
    />
  );
}

function DiceCenterTracker({
  centerRef,
  includedIndices,
  positionRefs,
  spreadRef,
}: {
  centerRef: MutableRefObject<THREE.Vector3>;
  includedIndices: readonly number[];
  positionRefs: readonly MutableRefObject<THREE.Vector3>[];
  spreadRef: MutableRefObject<number>;
}) {
  useFrame(() => {
    const trackedIndices =
      includedIndices.length > 0
        ? includedIndices
        : positionRefs.map((_, index) => index);
    centerRef.current.set(0, 0, 0);

    for (const index of trackedIndices) {
      centerRef.current.add(positionRefs[index].current);
    }

    centerRef.current.multiplyScalar(1 / trackedIndices.length);
    spreadRef.current = 0;

    for (const index of trackedIndices) {
      spreadRef.current = Math.max(
        spreadRef.current,
        centerRef.current.distanceTo(positionRefs[index].current),
      );
    }
  }, physicsSimulationConfig.updatePriority + 1);

  return null;
}

function TopViewEntryMonitor({
  active,
  diceIds,
  onEntered,
  positionRefs,
}: {
  active: boolean;
  diceIds: readonly number[];
  onEntered: () => void;
  positionRefs: readonly MutableRefObject<THREE.Vector3>[];
}) {
  const { height, width } = useThree((state) => state.size);
  const layout = useMemo(
    () => getTopViewLayout(width / Math.max(height, 1)),
    [height, width],
  );
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [active, diceIds]);

  useFrame(() => {
    if (!active || completedRef.current || diceIds.length === 0) return;

    const inset = physicsWorldConfig.topViewBounds.entrySafetyInset;
    const halfWidth = layout.boundaryHalfWidth - inset;
    const halfDepth = layout.boundaryHalfDepth - inset;
    const allInside = diceIds.every((diceIndex) => {
      const position = positionRefs[diceIndex]?.current;
      return (
        position !== undefined &&
        Math.abs(position.x) <= halfWidth &&
        Math.abs(position.z) <= halfDepth
      );
    });

    if (!allInside) return;
    completedRef.current = true;
    onEntered();
  }, physicsSimulationConfig.updatePriority + 2);

  return null;
}

type ImpactPulse = {
  color: string;
  id: number;
  position: THREE.Vector3;
  startedAt: number;
  strength: number;
};

function ImpactMark({
  impact,
  onComplete,
}: {
  impact: ImpactPulse;
  onComplete: (id: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    const elapsed = (performance.now() - impact.startedAt) / 420;
    if (elapsed >= 1) {
      onComplete(impact.id);
      return;
    }

    const eased = 1 - Math.pow(1 - elapsed, 3);
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (mesh) {
      const scale = 0.7 + eased * (2.4 + impact.strength * 1.4);
      mesh.scale.setScalar(scale);
    }
    if (material) {
      material.opacity = (1 - elapsed) * (0.1 + impact.strength * 0.18);
    }
    invalidate();
  });

  return (
    <mesh
      ref={meshRef}
      position={impact.position}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={3}
    >
      <ringGeometry args={[0.08, 0.13, 28]} />
      <meshBasicMaterial
        ref={materialRef}
        color={impact.color}
        depthWrite={false}
        opacity={0.2}
        transparent
      />
    </mesh>
  );
}

function ImpactMarks({
  impacts,
  onComplete,
}: {
  impacts: readonly ImpactPulse[];
  onComplete: (id: number) => void;
}) {
  return (
    <>
      {impacts.map((impact) => (
        <ImpactMark key={impact.id} impact={impact} onComplete={onComplete} />
      ))}
    </>
  );
}

function DiceInstance({
  appearance,
  dieType,
  diceIndex,
  dragEnabled,
  keyboardThrowKey,
  keyboardThrowEnabled,
  keyboardThrowPlan,
  onGrab,
  onImpact,
  onDragChange,
  onSettle,
  onThrowStart,
  physicsDebugEnabled,
  physicsProfile,
  parked,
  parkingAnchorRef,
  parkingOffset,
  positionRef,
  resetKey,
  resetBeforeKeyboardThrow,
  throwPower,
  transform,
  visible,
}: {
  appearance: DiceAppearance;
  dieType: DiceTypeId;
  diceIndex: number;
  dragEnabled: boolean;
  keyboardThrowKey: number;
  keyboardThrowEnabled: boolean;
  keyboardThrowPlan: TopViewThrowPlan | null;
  onGrab: (diceIndex: number) => void;
  onImpact: (diceIndex: number, impact: { position: THREE.Vector3; strength: number }) => void;
  onDragChange: (diceIndex: number, dragging: boolean) => void;
  onSettle: (diceIndex: number, face: number) => void;
  onThrowStart: (diceIndex: number) => void;
  physicsDebugEnabled: boolean;
  physicsProfile: PhysicsProfile;
  parked: boolean;
  parkingAnchorRef: MutableRefObject<THREE.Vector3>;
  parkingOffset: [number, number, number];
  positionRef: MutableRefObject<THREE.Vector3>;
  resetKey: number | string;
  resetBeforeKeyboardThrow: boolean;
  throwPower: number;
  transform: DiceTransform;
  visible: boolean;
}) {
  const handleDragChange = useCallback(
    (dragging: boolean) => onDragChange(diceIndex, dragging),
    [diceIndex, onDragChange],
  );
  const handleSettle = useCallback(
    (face: number) => onSettle(diceIndex, face),
    [diceIndex, onSettle],
  );
  const handleThrowStart = useCallback(
    () => onThrowStart(diceIndex),
    [diceIndex, onThrowStart],
  );
  const handleGrab = useCallback(() => onGrab(diceIndex), [diceIndex, onGrab]);
  const handleImpact = useCallback(
    (impact: { position: THREE.Vector3; strength: number }) =>
      onImpact(diceIndex, impact),
    [diceIndex, onImpact],
  );

  return (
    <Dice
      appearance={appearance}
      dieType={dieType}
      dragEnabled={dragEnabled}
      initialPosition={transform.position}
      initialRotation={transform.rotation}
      keyboardThrowKey={keyboardThrowKey}
      keyboardThrowEnabled={keyboardThrowEnabled}
      keyboardThrowPlan={keyboardThrowPlan}
      parked={parked}
      parkingAnchorRef={parkingAnchorRef}
      parkingOffset={parkingOffset}
      resetBeforeKeyboardThrow={resetBeforeKeyboardThrow}
      throwPower={throwPower}
      physicsDebugEnabled={physicsDebugEnabled}
      physicsProfile={physicsProfile}
      resetKey={resetKey}
      onDragChange={handleDragChange}
      onGrab={handleGrab}
      onImpact={handleImpact}
      onThrowStart={handleThrowStart}
      onSettle={handleSettle}
      trackedPosition={positionRef}
      visible={visible}
    />
  );
}

function RenderMetrics() {
  const { gl, invalidate, size } = useThree();
  const sample = useRef({
    bestFrameMs: Infinity,
    frames: 0,
    previousAt: 0,
    startedAt: 0,
    totalFrameMs: 0,
    worstFrameMs: 0,
  });

  useEffect(() => {
    sample.current.startedAt = performance.now();
    sample.current.previousAt = sample.current.startedAt;
    window.__3diceLastRenderMetrics = undefined;
    window.__3diceRenderMetrics = [];
  }, []);

  useFrame(() => {
    invalidate();

    const now = performance.now();
    const current = sample.current;

    if (current.startedAt === 0) {
      current.startedAt = now;
      current.previousAt = now;
      return;
    }

    const frameMs = now - current.previousAt;

    current.previousAt = now;
    current.frames += 1;
    current.totalFrameMs += frameMs;
    current.bestFrameMs = Math.min(current.bestFrameMs, frameMs);
    current.worstFrameMs = Math.max(current.worstFrameMs, frameMs);

    const sampleMs = now - current.startedAt;
    if (sampleMs < renderConfig.performance.sampleDurationMs) return;

    publishRenderMetrics({
      averageFrameMs: current.totalFrameMs / current.frames,
      bestFrameMs: current.bestFrameMs,
      drawCalls: gl.info.render.calls,
      dpr: gl.getPixelRatio(),
      fps: (current.frames / sampleMs) * 1000,
      frames: current.frames,
      lines: gl.info.render.lines,
      points: gl.info.render.points,
      sampleMs,
      triangles: gl.info.render.triangles,
      viewport: {
        width: size.width,
        height: size.height,
      },
      worstFrameMs: current.worstFrameMs,
    });

    current.bestFrameMs = Infinity;
    current.frames = 0;
    current.startedAt = now;
    current.totalFrameMs = 0;
    current.worstFrameMs = 0;
  });

  return null;
}

export function Scene({
  advancedMode,
  autoRecenterEnabled,
  cameraGesturesEnabled,
  cameraView,
  diceAppearance,
  diceCount,
  diceType,
  impactEffectsEnabled,
  lightingPreset,
  lockedDice,
  physicsProfile,
  resetKey,
  surface,
  throwPower,
  onGrab,
  onImpact,
  onThrowStart,
  onSettle,
}: SceneProps) {
  const diceTransforms = useMemo(
    () => getDiceInitialTransforms(diceCount, getDieInitialHeight(diceType)),
    [diceCount, diceType],
  );
  const dicePositionRefs = useMemo(
    () =>
      diceTransforms.map((transform) => ({
        current: new THREE.Vector3(...transform.position),
      })),
    [diceTransforms],
  );
  const diceCenterRef = useRef(new THREE.Vector3());
  const diceSpreadRef = useRef(0);
  const parkingAnchorWorldRef = useRef(new THREE.Vector3());
  const hadParkedDiceRef = useRef(false);
  const isAnyDiceDraggingRef = useRef(false);
  const activeDiceIdsRef = useRef(new Set<number>());
  const pendingRelaunchRef = useRef(false);
  const pendingRelaunchFrameRef = useRef<number | null>(null);
  const [keyboardThrowKey, setKeyboardThrowKey] = useState(0);
  const [relaunchResetKey, setRelaunchResetKey] = useState(0);
  const [cameraRecenterKey, setCameraRecenterKey] = useState(0);
  const [viewportAspect, setViewportAspect] = useState(getViewportAspect);
  const [topViewThrowPlans, setTopViewThrowPlans] = useState<
    (TopViewThrowPlan | null)[]
  >([]);
  const [topViewEnteringDiceIds, setTopViewEnteringDiceIds] = useState<
    number[]
  >([]);
  const [topViewHasThrown, setTopViewHasThrown] = useState(false);
  const [topViewEntering, setTopViewEntering] = useState(false);
  const [impactPulses, setImpactPulses] = useState<ImpactPulse[]>([]);
  const nextImpactIdRef = useRef(0);
  const sceneResetKey = `${resetKey}:${relaunchResetKey}`;
  const simulationEpoch = `${physicsProfile.id}:${diceType}:${diceCount}:${cameraView}:${sceneResetKey}`;
  const [sceneActivity, setSceneActivity] = useState<SceneActivity>({
    active: false,
    epoch: simulationEpoch,
  });
  const [staticShadowKey, setStaticShadowKey] = useState(0);
  const search = getCurrentSearch();
  const renderMetricsEnabled = isRenderPerfEnabled(search);
  const physicsDebugEnabled = isPhysicsDebugEnabled(search);
  const dpr = getRenderDprSetting(search);
  const topViewLayout = useMemo(
    () => getTopViewLayout(viewportAspect),
    [viewportAspect],
  );
  const isSceneActive =
    sceneActivity.epoch === simulationEpoch && sceneActivity.active;
  const throwableDiceIds = useMemo(
    () =>
      Array.from({ length: diceCount }, (_, index) => index).filter(
        (index) => diceCount === 1 || !lockedDice[index],
      ),
    [diceCount, lockedDice],
  );
  const cameraTrackedDiceIds = useMemo(
    () => Array.from({ length: diceCount }, (_, index) => index),
    [diceCount],
  );
  const lockedDiceSignature = lockedDice
    .slice(0, diceCount)
    .map((locked) => (locked ? "1" : "0"))
    .join("");
  const hasParkedDice = advancedMode && lockedDiceSignature.includes("1");

  if (hasParkedDice && !hadParkedDiceRef.current) {
    parkingAnchorWorldRef.current.copy(diceCenterRef.current);
  }
  hadParkedDiceRef.current = hasParkedDice;

  useEffect(() => {
    const handleResize = () => setViewportAspect(getViewportAspect());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const parkingOffsets = useMemo(() => {
    const lockedIndices = Array.from(
      { length: diceCount },
      (_, index) => index,
    ).filter((index) => advancedMode && Boolean(lockedDice[index]));
    const dieHeight = getDieInitialHeight(diceType);
    const spacing = Math.max(LOCKED_DICE_MIN_SPACING, dieHeight * 1.72);
    const sideDistance = clampNumber(
      LOCKED_DICE_SIDE_DISTANCE * viewportAspect,
      LOCKED_DICE_MIN_SIDE_DISTANCE,
      LOCKED_DICE_SIDE_DISTANCE,
    );

    return diceTransforms.map((transform, diceIndex) => {
      const lockedRank = lockedIndices.indexOf(diceIndex);
      if (lockedRank === -1) return transform.position;

      // The row direction is based on the default camera only once. Its world
      // anchor is captured when the first die is locked, then remains fixed.
      const rowOffset = (lockedRank - (lockedIndices.length - 1) / 2) * spacing;
      const offset = new THREE.Vector3()
        .addScaledVector(
          BASE_CAMERA_RIGHT_HORIZONTAL,
          -sideDistance,
        )
        .addScaledVector(BASE_CAMERA_FORWARD_HORIZONTAL, rowOffset);
      offset.y = dieHeight;
      return offset.toArray() as [number, number, number];
    });
  }, [
    advancedMode,
    diceCount,
    diceTransforms,
    diceType,
    lockedDice,
    viewportAspect,
  ]);
  const setIsSceneActive = useCallback(
    (active: boolean) => {
      setSceneActivity({ active, epoch: simulationEpoch });
    },
    [simulationEpoch],
  );

  const refreshStaticShadow = useCallback(() => {
    setIsSceneActive(false);
    setStaticShadowKey((value) => value + 1);
  }, [setIsSceneActive]);

  useLayoutEffect(() => {
    activeDiceIdsRef.current.clear();
    isAnyDiceDraggingRef.current = false;
    diceCenterRef.current.set(0, 0, 0);

    for (let index = 0; index < dicePositionRefs.length; index += 1) {
      if (!lockedDice[index]) {
        dicePositionRefs[index].current.set(...diceTransforms[index].position);
      }
      diceCenterRef.current.add(dicePositionRefs[index].current);
    }

    diceCenterRef.current.multiplyScalar(1 / dicePositionRefs.length);
    diceSpreadRef.current = 0;

    for (const positionRef of dicePositionRefs) {
      diceSpreadRef.current = Math.max(
        diceSpreadRef.current,
        diceCenterRef.current.distanceTo(positionRef.current),
      );
    }
  }, [dicePositionRefs, diceTransforms, simulationEpoch]);

  useLayoutEffect(() => {
    setTopViewThrowPlans([]);
    setTopViewEnteringDiceIds([]);
    setTopViewHasThrown(false);
    setTopViewEntering(false);
  }, [cameraView, diceCount, diceType, physicsProfile.id, resetKey]);

  useEffect(() => {
    if (pendingRelaunchFrameRef.current !== null) {
      cancelAnimationFrame(pendingRelaunchFrameRef.current);
      pendingRelaunchFrameRef.current = null;
    }
    pendingRelaunchRef.current = false;
  }, [cameraView, diceCount, diceType, physicsProfile.id, resetKey]);

  useEffect(() => {
    refreshStaticShadow();
  }, [refreshStaticShadow, relaunchResetKey, resetKey]);

  useEffect(() => {
    if (!advancedMode) return;
    setCameraRecenterKey((value) => value + 1);
    refreshStaticShadow();
  }, [advancedMode, lockedDiceSignature, refreshStaticShadow]);

  useEffect(() => {
    if (!pendingRelaunchRef.current) return;

    const frameId = requestAnimationFrame(() => {
      pendingRelaunchFrameRef.current = null;
      if (!pendingRelaunchRef.current) return;

      pendingRelaunchRef.current = false;
      activeDiceIdsRef.current = new Set(throwableDiceIds);
      if (cameraView === "top") {
        setTopViewHasThrown(true);
      }
      setIsSceneActive(true);
      setKeyboardThrowKey((value) => value + 1);
    });
    pendingRelaunchFrameRef.current = frameId;

    return () => {
      if (pendingRelaunchFrameRef.current === frameId) {
        cancelAnimationFrame(frameId);
        pendingRelaunchFrameRef.current = null;
      }
    };
  }, [cameraView, relaunchResetKey, setIsSceneActive, throwableDiceIds]);

  const handleDiceDragChange = useCallback((diceIndex: number, dragging: boolean) => {
    isAnyDiceDraggingRef.current = dragging;
    if (dragging) {
      activeDiceIdsRef.current.add(diceIndex);
      setIsSceneActive(true);
    }
  }, [setIsSceneActive]);

  const handleThrowStart = useCallback((diceIndex: number) => {
    activeDiceIdsRef.current.add(diceIndex);
    setIsSceneActive(true);
    onThrowStart(diceIndex);
  }, [onThrowStart, setIsSceneActive]);

  const handleDiceGrab = useCallback(
    (diceIndex: number) => onGrab(diceIndex),
    [onGrab],
  );

  const handleDiceImpact = useCallback(
    (
      diceIndex: number,
      impact: { position: THREE.Vector3; strength: number },
    ) => {
      onImpact(diceIndex, impact.strength);
      if (!impactEffectsEnabled) return;

      const nextImpact: ImpactPulse = {
        color: surface.floor,
        id: nextImpactIdRef.current++,
        position: impact.position,
        startedAt: performance.now(),
        strength: impact.strength,
      };
      setImpactPulses((current) => [...current.slice(-5), nextImpact]);
    },
    [impactEffectsEnabled, onImpact, surface.floor],
  );

  const removeImpactPulse = useCallback((id: number) => {
    setImpactPulses((current) => current.filter((impact) => impact.id !== id));
  }, []);

  const handleTopViewEntryComplete = useCallback(() => {
    setTopViewEntering(false);
  }, []);

  const handleSettle = useCallback((diceIndex: number, face: number) => {
    activeDiceIdsRef.current.delete(diceIndex);
    onSettle(diceIndex, face);

    if (activeDiceIdsRef.current.size === 0) {
      if (advancedMode && autoRecenterEnabled) {
        setCameraRecenterKey((value) => value + 1);
      }
      refreshStaticShadow();
    }
  }, [advancedMode, autoRecenterEnabled, onSettle, refreshStaticShadow]);

  const requestDiceThrow = useCallback(() => {
    const throwMode = getDiceSpaceThrowMode({
      diceCount,
      hasActiveDice: activeDiceIdsRef.current.size > 0,
      resetBeforeThrow: cameraView === "top",
    });

    if (throwMode === "blocked") return;
    if (throwableDiceIds.length === 0) return;

    if (throwMode === "reset-and-throw") {
      if (pendingRelaunchRef.current) return;

      if (cameraView === "top") {
        const plans = getTopViewThrowPlans({
          count: throwableDiceIds.length,
          initialHeight: getDieInitialHeight(diceType),
          layout: topViewLayout,
        });
        const plansByDice = Array<TopViewThrowPlan | null>(diceCount).fill(
          null,
        );
        throwableDiceIds.forEach((diceIndex, planIndex) => {
          plansByDice[diceIndex] = plans[planIndex];
        });
        setTopViewThrowPlans(plansByDice);
        setTopViewEnteringDiceIds([...throwableDiceIds]);
        setTopViewEntering(true);
      }

      pendingRelaunchRef.current = true;
      activeDiceIdsRef.current.clear();
      isAnyDiceDraggingRef.current = false;
      setIsSceneActive(false);
      setRelaunchResetKey((value) => value + 1);
      return;
    }

    activeDiceIdsRef.current = new Set(throwableDiceIds);
    setIsSceneActive(true);
    setKeyboardThrowKey((value) => value + 1);
  }, [
    cameraView,
    diceCount,
    diceType,
    setIsSceneActive,
    throwableDiceIds,
    topViewLayout,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const blockedTarget =
        event.target instanceof Element &&
        event.target.closest(SPACE_THROW_BLOCKED_TARGET_SELECTOR) !== null;
      const action = getSpaceThrowKeyAction({
        blockedTarget,
        code: event.code,
        defaultPrevented: event.defaultPrevented,
        repeat: event.repeat,
      });

      if (action === "ignore") return;
      event.preventDefault();

      if (action !== "throw") return;
      requestDiceThrow();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestDiceThrow]);

  return (
    <Canvas
      className="scene-canvas"
      shadows
      dpr={dpr}
      frameloop="demand"
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = lightingPreset.toneMappingExposure;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <color attach="background" args={[surface.background]} />
      <fog attach="fog" args={[surface.fog, 24, 145]} />
      <PerspectiveCamera
        makeDefault
        position={BASE_CAMERA_POSITION.toArray()}
        fov={renderConfig.camera.topView.fov}
        near={0.1}
        far={1200}
      />
      <ActiveFrameDriver active={isSceneActive} />
      <ToneMappingController preset={lightingPreset} />
      <TouchThrowControl
        isDiceDraggingRef={isAnyDiceDraggingRef}
        onTap={requestDiceThrow}
      />
      <CameraRig
        cameraView={cameraView}
        dicePositionRef={diceCenterRef}
        diceSpreadRef={diceSpreadRef}
        gesturesEnabled={
          cameraView === "free" && advancedMode && cameraGesturesEnabled
        }
        isDiceDraggingRef={isAnyDiceDraggingRef}
        recenterKey={cameraRecenterKey}
        resetKey={sceneResetKey}
      />
      <DiceCenterTracker
        centerRef={diceCenterRef}
        includedIndices={cameraTrackedDiceIds}
        positionRefs={dicePositionRefs}
        spreadRef={diceSpreadRef}
      />
      <TopViewEntryMonitor
        active={cameraView === "top" && topViewEntering}
        diceIds={topViewEnteringDiceIds}
        onEntered={handleTopViewEntryComplete}
        positionRefs={dicePositionRefs}
      />
      {renderMetricsEnabled ? <RenderMetrics /> : null}
      <ShadowMapController dynamic={isSceneActive} staticKey={staticShadowKey} />
      <ambientLight intensity={lightingPreset.ambientIntensity} />
      <hemisphereLight
        color={lightingPreset.hemisphereSkyColor}
        groundColor={lightingPreset.hemisphereGroundColor}
        intensity={lightingPreset.hemisphereIntensity}
      />
      <StudioLights dicePositionRef={diceCenterRef} preset={lightingPreset} />

      <Physics
        key={`${physicsProfile.id}:${diceType}:${diceCount}`}
        gravity={physicsProfile.gravity}
        maxCcdSubsteps={physicsSimulationConfig.maxCcdSubsteps}
        paused={!isSceneActive}
        timeStep={physicsSimulationConfig.fixedTimeStep}
        updateLoop="follow"
        updatePriority={physicsSimulationConfig.updatePriority}
      >
        {diceTransforms.map((transform, diceIndex) => (
          <DiceInstance
            // An explicit Reset remounts the body so Three and paused Rapier
            // cannot retain different transforms. Automatic relaunches keep
            // the same resetKey and still reset atomically inside Dice.
            key={`${resetKey}:${diceIndex}`}
            appearance={diceAppearance}
            dieType={diceType}
            diceIndex={diceIndex}
            dragEnabled={cameraView === "free" && diceCount === 1}
            keyboardThrowKey={keyboardThrowKey}
            keyboardThrowEnabled={throwableDiceIds.includes(diceIndex)}
            keyboardThrowPlan={topViewThrowPlans[diceIndex] ?? null}
            parked={advancedMode && Boolean(lockedDice[diceIndex])}
            parkingAnchorRef={parkingAnchorWorldRef}
            parkingOffset={parkingOffsets[diceIndex]}
            onGrab={handleDiceGrab}
            onImpact={handleDiceImpact}
            physicsDebugEnabled={physicsDebugEnabled && diceIndex === 0}
            physicsProfile={physicsProfile}
            positionRef={dicePositionRefs[diceIndex]}
            resetBeforeKeyboardThrow={diceCount > 1 || cameraView === "top"}
            resetKey={resetKey}
            throwPower={throwPower}
            transform={transform}
            visible={cameraView === "free" || topViewHasThrown}
            onDragChange={handleDiceDragChange}
            onThrowStart={handleThrowStart}
            onSettle={handleSettle}
          />
        ))}
        {cameraView === "top" && !topViewEntering ? (
          <TopViewBounds physicsProfile={physicsProfile} />
        ) : null}
        <Floor physicsProfile={physicsProfile} surface={surface} />
      </Physics>
      <FollowContactShadows
        dicePositionRef={diceCenterRef}
        dynamic={isSceneActive}
        scale={Math.min(
          renderConfig.shadows.contactScale + (diceCount - 1) * 1.05,
          5,
        )}
        staticKey={staticShadowKey}
      />
      {impactEffectsEnabled ? (
        <ImpactMarks impacts={impactPulses} onComplete={removeImpactPulse} />
      ) : null}
      <StudioEnvironment preset={lightingPreset} />
    </Canvas>
  );
}
