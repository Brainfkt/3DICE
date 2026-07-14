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
import { BoundedWorld } from "./worlds/BoundedWorld";
import {
  DiceAppearance,
  DiceCount,
  SurfaceTheme,
  WorldType,
} from "../settings/config";
import {
  getSpaceThrowKeyAction,
  SPACE_THROW_BLOCKED_TARGET_SELECTOR,
} from "../input/keyboardThrow";

type SceneProps = {
  diceAppearance: DiceAppearance;
  diceCount: DiceCount;
  physicsProfile: PhysicsProfile;
  resetKey: number;
  surface: SurfaceTheme;
  uiRevision: number;
  worldType: WorldType;
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

function RenderInvalidation({ revision }: { revision: number }) {
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    invalidate();
  }, [invalidate, revision]);

  return null;
}

type CameraRigProps = {
  dicePositionRef: MutableRefObject<THREE.Vector3>;
  diceSpreadRef: MutableRefObject<number>;
  isDiceDraggingRef: MutableRefObject<boolean>;
  resetKey: number;
};

function CameraRig({
  dicePositionRef,
  diceSpreadRef,
  isDiceDraggingRef,
  resetKey,
}: CameraRigProps) {
  const { camera, gl, invalidate } = useThree();
  const lookAtRef = useRef(BASE_LOOK_AT.clone());
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const desiredLookAt = useMemo(() => new THREE.Vector3(), []);
  const lookAtDelta = useMemo(() => new THREE.Vector3(), []);
  const zoomTarget = useRef(1);
  const zoomCurrent = useRef(1);
  const pinchPointers = useRef(new Map<number, THREE.Vector2>());
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(1);

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
      event.preventDefault();
      zoomTarget.current = clampNumber(
        zoomTarget.current * Math.exp(event.deltaY * 0.001),
        MIN_CAMERA_ZOOM,
        MAX_CAMERA_ZOOM,
      );
      invalidate();
    };

    const handlePointerDown = (event: PointerEvent) => {
      pinchPointers.current.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (pinchPointers.current.size === 2) {
        startPinch();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = pinchPointers.current.get(event.pointerId);
      if (!point) return;

      point.set(event.clientX, event.clientY);
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
      if (pinchPointers.current.size < 2) {
        pinchStartDistance.current = 0;
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
  }, [gl.domElement, invalidate]);

  useEffect(() => {
    lookAtRef.current.copy(BASE_LOOK_AT);
    desiredLookAt.copy(BASE_LOOK_AT);
    desiredPosition.copy(BASE_CAMERA_POSITION);
    zoomTarget.current = 1;
    zoomCurrent.current = 1;
    pinchPointers.current.clear();
    pinchStartDistance.current = 0;
    pinchStartZoom.current = 1;
    camera.position.copy(BASE_CAMERA_POSITION);
    camera.lookAt(lookAtRef.current);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, desiredLookAt, desiredPosition, invalidate, resetKey]);

  useFrame((_, delta) => {
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
    const isDiceDragging = isDiceDraggingRef.current;

    if (isDiceDragging) {
      camera.lookAt(lookAtRef.current);
      return;
    }

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
          GROUP_ZOOM_PER_UNIT,
      1,
      AUTO_ZOOM_MAX,
    );
    const autoZoom = Math.max(followAutoZoom, groupAutoZoom);

    const desiredZoom = Math.max(zoomTarget.current, autoZoom);

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

    desiredPosition
      .copy(lookAtRef.current)
      .addScaledVector(BASE_CAMERA_OFFSET, zoomCurrent.current);

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

function StudioLights({ dicePositionRef }: StudioLightsProps) {
  return (
    <>
      {renderConfig.lighting.sources.map((source) =>
        source.kind === "spot" ? (
          <SpotRig key={source.id} dicePositionRef={dicePositionRef} source={source} />
        ) : (
          <PointRig key={source.id} dicePositionRef={dicePositionRef} source={source} />
        ),
      )}
    </>
  );
}

const StudioEnvironment = memo(function StudioEnvironment() {
  return (
    <Environment
      background={false}
      environmentIntensity={renderConfig.lighting.environmentIntensity}
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
          color={lightformer.color}
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
  positionRefs,
  spreadRef,
}: {
  centerRef: MutableRefObject<THREE.Vector3>;
  positionRefs: readonly MutableRefObject<THREE.Vector3>[];
  spreadRef: MutableRefObject<number>;
}) {
  useFrame(() => {
    centerRef.current.set(0, 0, 0);

    for (const positionRef of positionRefs) {
      centerRef.current.add(positionRef.current);
    }

    centerRef.current.multiplyScalar(1 / positionRefs.length);
    spreadRef.current = 0;

    for (const positionRef of positionRefs) {
      spreadRef.current = Math.max(
        spreadRef.current,
        centerRef.current.distanceTo(positionRef.current),
      );
    }
  }, physicsSimulationConfig.updatePriority + 1);

  return null;
}

function DiceInstance({
  appearance,
  diceIndex,
  keyboardThrowKey,
  onDragChange,
  onSettle,
  onThrowStart,
  physicsDebugEnabled,
  physicsProfile,
  positionRef,
  resetKey,
  transform,
}: {
  appearance: DiceAppearance;
  diceIndex: number;
  keyboardThrowKey: number;
  onDragChange: (diceIndex: number, dragging: boolean) => void;
  onSettle: (diceIndex: number, face: number) => void;
  onThrowStart: (diceIndex: number) => void;
  physicsDebugEnabled: boolean;
  physicsProfile: PhysicsProfile;
  positionRef: MutableRefObject<THREE.Vector3>;
  resetKey: number;
  transform: DiceTransform;
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

  return (
    <Dice
      appearance={appearance}
      initialPosition={transform.position}
      initialRotation={transform.rotation}
      keyboardThrowKey={keyboardThrowKey}
      physicsDebugEnabled={physicsDebugEnabled}
      physicsProfile={physicsProfile}
      resetKey={resetKey}
      onDragChange={handleDragChange}
      onThrowStart={handleThrowStart}
      onSettle={handleSettle}
      trackedPosition={positionRef}
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
  diceAppearance,
  diceCount,
  physicsProfile,
  resetKey,
  surface,
  uiRevision,
  worldType,
  onThrowStart,
  onSettle,
}: SceneProps) {
  const diceTransforms = useMemo(
    () => getDiceInitialTransforms(diceCount),
    [diceCount],
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
  const isAnyDiceDraggingRef = useRef(false);
  const activeDiceIdsRef = useRef(new Set<number>());
  const draggingDiceIdsRef = useRef(new Set<number>());
  const [keyboardThrowKey, setKeyboardThrowKey] = useState(0);
  const simulationEpoch = `${physicsProfile.id}:${worldType}:${diceCount}:${resetKey}`;
  const [sceneActivity, setSceneActivity] = useState<SceneActivity>({
    active: false,
    epoch: simulationEpoch,
  });
  const [staticShadowKey, setStaticShadowKey] = useState(0);
  const search = getCurrentSearch();
  const renderMetricsEnabled = isRenderPerfEnabled(search);
  const physicsDebugEnabled = isPhysicsDebugEnabled(search);
  const dpr = getRenderDprSetting(search);
  const isSceneActive =
    sceneActivity.epoch === simulationEpoch && sceneActivity.active;

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
    draggingDiceIdsRef.current.clear();
    isAnyDiceDraggingRef.current = false;
    diceCenterRef.current.set(0, 0, 0);

    for (const positionRef of dicePositionRefs) {
      diceCenterRef.current.add(positionRef.current);
    }

    diceCenterRef.current.multiplyScalar(1 / dicePositionRefs.length);
    diceSpreadRef.current = 0;

    for (const positionRef of dicePositionRefs) {
      diceSpreadRef.current = Math.max(
        diceSpreadRef.current,
        diceCenterRef.current.distanceTo(positionRef.current),
      );
    }
  }, [dicePositionRefs, simulationEpoch]);

  useEffect(() => {
    refreshStaticShadow();
  }, [refreshStaticShadow, resetKey]);

  const handleDiceDragChange = useCallback((diceIndex: number, dragging: boolean) => {
    if (dragging) {
      draggingDiceIdsRef.current.add(diceIndex);
      activeDiceIdsRef.current.add(diceIndex);
      setIsSceneActive(true);
    } else {
      draggingDiceIdsRef.current.delete(diceIndex);
    }

    isAnyDiceDraggingRef.current = draggingDiceIdsRef.current.size > 0;
  }, [setIsSceneActive]);

  const handleThrowStart = useCallback((diceIndex: number) => {
    activeDiceIdsRef.current.add(diceIndex);
    setIsSceneActive(true);
    onThrowStart(diceIndex);
  }, [onThrowStart, setIsSceneActive]);

  const handleSettle = useCallback((diceIndex: number, face: number) => {
    activeDiceIdsRef.current.delete(diceIndex);
    onSettle(diceIndex, face);

    if (activeDiceIdsRef.current.size === 0) {
      refreshStaticShadow();
    }
  }, [onSettle, refreshStaticShadow]);

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

      if (action !== "throw" || activeDiceIdsRef.current.size > 0) return;

      activeDiceIdsRef.current = new Set(
        Array.from({ length: diceCount }, (_, index) => index),
      );
      setIsSceneActive(true);
      setKeyboardThrowKey((value) => value + 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [diceCount, setIsSceneActive]);

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
        gl.toneMappingExposure = renderConfig.lighting.toneMappingExposure;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <color attach="background" args={[surface.background]} />
      <fog attach="fog" args={[surface.fog, 24, 145]} />
      <PerspectiveCamera makeDefault position={BASE_CAMERA_POSITION.toArray()} fov={46} near={0.1} far={1200} />
      <ActiveFrameDriver active={isSceneActive} />
      <RenderInvalidation revision={uiRevision} />
      <CameraRig
        dicePositionRef={diceCenterRef}
        diceSpreadRef={diceSpreadRef}
        isDiceDraggingRef={isAnyDiceDraggingRef}
        resetKey={resetKey}
      />
      <DiceCenterTracker
        centerRef={diceCenterRef}
        positionRefs={dicePositionRefs}
        spreadRef={diceSpreadRef}
      />
      {renderMetricsEnabled ? <RenderMetrics /> : null}
      <ShadowMapController dynamic={isSceneActive} staticKey={staticShadowKey} />
      <ambientLight intensity={renderConfig.lighting.ambientIntensity} />
      <hemisphereLight
        color={renderConfig.lighting.hemisphereSkyColor}
        groundColor={renderConfig.lighting.hemisphereGroundColor}
        intensity={renderConfig.lighting.hemisphereIntensity}
      />
      <StudioLights dicePositionRef={diceCenterRef} />

      <Physics
        key={`${physicsProfile.id}:${worldType}:${diceCount}`}
        gravity={physicsProfile.gravity}
        maxCcdSubsteps={physicsSimulationConfig.maxCcdSubsteps}
        paused={!isSceneActive}
        timeStep={physicsSimulationConfig.fixedTimeStep}
        updateLoop="follow"
        updatePriority={physicsSimulationConfig.updatePriority}
      >
        {diceTransforms.map((transform, diceIndex) => (
          <DiceInstance
            key={`${resetKey}:${diceIndex}`}
            appearance={diceAppearance}
            diceIndex={diceIndex}
            keyboardThrowKey={keyboardThrowKey}
            physicsDebugEnabled={physicsDebugEnabled && diceIndex === 0}
            physicsProfile={physicsProfile}
            positionRef={dicePositionRefs[diceIndex]}
            resetKey={resetKey}
            transform={transform}
            onDragChange={handleDiceDragChange}
            onThrowStart={handleThrowStart}
            onSettle={handleSettle}
          />
        ))}
        {worldType === "bounded" ? (
          <BoundedWorld physicsProfile={physicsProfile} surface={surface} />
        ) : (
          <Floor physicsProfile={physicsProfile} surface={surface} />
        )}
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
      <StudioEnvironment />
    </Canvas>
  );
}
