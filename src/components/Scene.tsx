import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, PerspectiveCamera, SoftShadows } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import * as THREE from "three";
import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { Dice } from "./Dice";
import { Floor } from "./Floor";
import { PhysicsProfile } from "../physics/config";
import { renderConfig } from "../render/config";
import {
  getRenderDprSetting,
  isRenderPerfEnabled,
  publishRenderMetrics,
} from "../render/performance";

type SceneProps = {
  physicsProfile: PhysicsProfile;
  resetKey: number;
  onThrowStart: () => void;
  onSettle: (face: number) => void;
};

const BASE_CAMERA_POSITION = new THREE.Vector3(8.2, 5.6, 9.4);
const BASE_LOOK_AT = new THREE.Vector3(0, 0.36, 0);
const BASE_CAMERA_OFFSET = BASE_CAMERA_POSITION.clone().sub(BASE_LOOK_AT);
const MIN_CAMERA_ZOOM = 0.62;
const MAX_CAMERA_ZOOM = 2.4;
const AUTO_ZOOM_MAX = 2.15;
const AUTO_ZOOM_START_DISTANCE = 1.45;
const AUTO_ZOOM_PER_UNIT = 0.065;
const CAMERA_ZOOM_SPEED = 5.8;
const CAMERA_LOOK_SPEED = 10.5;
const CAMERA_CATCHUP_PER_UNIT = 1.05;
const CAMERA_MAX_LOOK_SPEED = 34;
const CAMERA_POSITION_SPEED = 8.4;
const CAMERA_POSITION_CATCHUP_PER_UNIT = 0.85;
const CAMERA_MAX_POSITION_SPEED = 26;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCurrentSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

type CameraRigProps = {
  dicePositionRef: MutableRefObject<THREE.Vector3>;
  isDiceDraggingRef: MutableRefObject<boolean>;
  resetKey: number;
};

function CameraRig({ dicePositionRef, isDiceDraggingRef, resetKey }: CameraRigProps) {
  const { camera, gl } = useThree();
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
  }, [gl.domElement]);

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
  }, [camera, desiredLookAt, desiredPosition, resetKey]);

  useFrame((_, delta) => {
    const dicePosition = dicePositionRef.current;
    const diceHeightLift = Math.min(Math.max(dicePosition.y - 0.58, 0), 2.2) * 0.18;
    const isDiceDragging = isDiceDraggingRef.current;

    if (isDiceDragging) {
      camera.lookAt(lookAtRef.current);
      return;
    }

    desiredLookAt.set(dicePosition.x, BASE_LOOK_AT.y + diceHeightLift, dicePosition.z);

    const lookAtLag = lookAtRef.current.distanceTo(desiredLookAt);
    const autoZoom = clampNumber(
      1 + Math.max(lookAtLag - AUTO_ZOOM_START_DISTANCE, 0) * AUTO_ZOOM_PER_UNIT,
      1,
      AUTO_ZOOM_MAX,
    );

    zoomCurrent.current = THREE.MathUtils.damp(
      zoomCurrent.current,
      Math.max(zoomTarget.current, autoZoom),
      CAMERA_ZOOM_SPEED,
      delta,
    );

    lookAtDelta.copy(desiredLookAt).sub(lookAtRef.current);

    if (lookAtLag > 0.001) {
      const maxLookStep =
        clampNumber(
          CAMERA_LOOK_SPEED + lookAtLag * CAMERA_CATCHUP_PER_UNIT,
          CAMERA_LOOK_SPEED,
          CAMERA_MAX_LOOK_SPEED,
        ) * delta;

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

    camera.position.lerp(desiredPosition, 1 - Math.exp(-delta * positionSpeed));
    camera.lookAt(lookAtRef.current);
  });

  return null;
}

type FollowDirectionalLightProps = {
  dicePositionRef: MutableRefObject<THREE.Vector3>;
};

function FollowDirectionalLight({ dicePositionRef }: FollowDirectionalLightProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = target;
      lightRef.current.shadow.camera.updateProjectionMatrix();
    }
  }, [target]);

  useFrame(() => {
    const dicePosition = dicePositionRef.current;

    target.position.set(dicePosition.x, 0.24, dicePosition.z);
    target.updateMatrixWorld();

    if (!lightRef.current) return;

    lightRef.current.position.set(
      dicePosition.x + 3.5,
      dicePosition.y + 6.2,
      dicePosition.z + 3.4,
    );
    lightRef.current.target.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={lightRef}
        castShadow
        position={[3.5, 6.2, 3.4]}
        intensity={2.25}
        shadow-mapSize={[renderConfig.shadows.mapSize, renderConfig.shadows.mapSize]}
        shadow-bias={renderConfig.shadows.bias}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
      />
    </>
  );
}

function RenderMetrics() {
  const { gl, size } = useThree();
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

export function Scene({ physicsProfile, resetKey, onThrowStart, onSettle }: SceneProps) {
  const dicePositionRef = useRef(new THREE.Vector3(0, 0.58, 0));
  const isDiceDraggingRef = useRef(false);
  const search = getCurrentSearch();
  const renderMetricsEnabled = isRenderPerfEnabled(search);
  const dpr = getRenderDprSetting(search);

  return (
    <Canvas
      className="scene-canvas"
      shadows="soft"
      dpr={dpr}
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
      }}
    >
      <color attach="background" args={["#171716"]} />
      <fog attach="fog" args={["#171716", 26, 150]} />
      <PerspectiveCamera makeDefault position={[8.2, 5.6, 9.4]} fov={46} near={0.1} far={1200} />
      <CameraRig
        dicePositionRef={dicePositionRef}
        isDiceDraggingRef={isDiceDraggingRef}
        resetKey={resetKey}
      />
      {renderMetricsEnabled ? <RenderMetrics /> : null}
      <SoftShadows
        size={renderConfig.shadows.softSize}
        samples={renderConfig.shadows.softSamples}
        focus={renderConfig.shadows.softFocus}
      />

      <ambientLight intensity={renderConfig.lighting.ambientIntensity} />
      <FollowDirectionalLight dicePositionRef={dicePositionRef} />
      <pointLight
        position={[-3, 3.4, -2.5]}
        intensity={renderConfig.lighting.rimPointIntensity}
        color="#ded3bf"
      />

      <Physics
        key={physicsProfile.id}
        gravity={physicsProfile.gravity}
        timeStep="vary"
      >
        <Dice
          physicsProfile={physicsProfile}
          resetKey={resetKey}
          onThrowStart={onThrowStart}
          onSettle={onSettle}
          trackedPosition={dicePositionRef}
          isDraggingRef={isDiceDraggingRef}
        />
        <Floor physicsProfile={physicsProfile} />
      </Physics>

      <Environment
        preset="studio"
        background={false}
        environmentIntensity={renderConfig.lighting.environmentIntensity}
      />
    </Canvas>
  );
}
