import { CollisionEnterPayload, CuboidCollider, RigidBody } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PhysicsProfile } from "../../physics/config";
import { renderConfig } from "../../render/config";
import { createFloorTextureData } from "../../render/floorTexture";

// Dormant world type kept from the bounded-arena iteration.
// It is not mounted now, but can be reused later if the app exposes selectable world types.
type Boundary = "north" | "south" | "west" | "east" | "ceiling";

type BoundaryPulse = {
  id: number;
  boundary: Boundary;
  position: THREE.Vector3;
};

type BoundaryPulseMeshProps = {
  boundary: Boundary;
  position: THREE.Vector3;
  duration: number;
  onDone: () => void;
};

type BoundedWorldProps = {
  physicsProfile: PhysicsProfile;
};

const boundaryPulseVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const boundaryPulseFragmentShader = `
uniform float uProgress;
varying vec2 vUv;

void main() {
  vec2 centered = vUv - vec2(0.5);
  float distanceFromCenter = length(centered);
  float angle = atan(centered.y, centered.x);
  float radius = mix(0.045, 0.45, uProgress);
  float width = mix(0.09, 0.055, uProgress);
  radius += sin(angle * 7.0 + uProgress * 15.0) * 0.009 * (1.0 - uProgress);

  float innerEdge = smoothstep(radius - width, radius, distanceFromCenter);
  float outerEdge = 1.0 - smoothstep(radius, radius + width, distanceFromCenter);
  float ring = innerEdge * outerEdge;
  float halo = (1.0 - smoothstep(0.0, radius + width * 1.85, distanceFromCenter)) * 0.08;
  float fade = pow(1.0 - uProgress, 1.05);
  float alpha = clamp((ring * 0.98 + halo * (1.0 - uProgress)) * fade, 0.0, 0.94);
  vec3 color = vec3(0.95, 0.08, 0.055);

  if (alpha < 0.01) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`;

function getBoundaryRippleRotation(boundary: Boundary) {
  switch (boundary) {
    case "north":
    case "south":
      return [0, 0, 0] as [number, number, number];
    case "west":
    case "east":
      return [0, Math.PI / 2, 0] as [number, number, number];
    case "ceiling":
      return [-Math.PI / 2, 0, 0] as [number, number, number];
  }
}

function BoundaryPulseMesh({
  boundary,
  position,
  duration,
  onDone,
}: BoundaryPulseMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const startTime = useRef<number | null>(null);
  const hasCompleted = useRef(false);
  const uniforms = useMemo(() => ({ uProgress: { value: 0 } }), []);
  const rotation = getBoundaryRippleRotation(boundary);
  const diameter = 5.2;

  useFrame(({ clock }) => {
    if (hasCompleted.current) return;

    if (startTime.current === null) {
      startTime.current = clock.elapsedTime;
    }

    const progress = Math.min((clock.elapsedTime - startTime.current) / duration, 1);

    if (materialRef.current) {
      materialRef.current.uniforms.uProgress.value = progress;
    }
    if (progress >= 1) {
      hasCompleted.current = true;
      onDone();
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      renderOrder={4}
    >
      <planeGeometry args={[diameter, diameter]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={boundaryPulseVertexShader}
        fragmentShader={boundaryPulseFragmentShader}
        depthTest
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCollisionPoint(
  boundary: Boundary,
  payload: CollisionEnterPayload,
  halfExtent: number,
  ceilingHeight: number,
) {
  const solverPoint =
    payload.manifold.numSolverContacts() > 0
      ? payload.manifold.solverContactPoint(0)
      : null;
  const bodyPoint = payload.other.rigidBody?.translation();
  const source = solverPoint ?? bodyPoint ?? { x: 0, y: 0.58, z: 0 };
  const margin = 0.24;
  const inset = 0.025;
  const y = clampNumber(source.y, 0.32, ceilingHeight - 0.25);
  const x = clampNumber(source.x, -halfExtent + margin, halfExtent - margin);
  const z = clampNumber(source.z, -halfExtent + margin, halfExtent - margin);

  switch (boundary) {
    case "north":
      return new THREE.Vector3(x, y, -halfExtent + inset);
    case "south":
      return new THREE.Vector3(x, y, halfExtent - inset);
    case "west":
      return new THREE.Vector3(-halfExtent + inset, y, z);
    case "east":
      return new THREE.Vector3(halfExtent - inset, y, z);
    case "ceiling":
      return new THREE.Vector3(x, ceilingHeight - inset, z);
  }
}

export function BoundedWorld({ physicsProfile }: BoundedWorldProps) {
  const pulseId = useRef(0);
  const [pulses, setPulses] = useState<BoundaryPulse[]>([]);
  const floor = physicsProfile.floor;
  const halfExtent = floor.halfExtent;
  const size = halfExtent * 2;
  const wallHeight = floor.wallHeight;
  const wallThickness = floor.wallThickness;
  const wallY = wallHeight / 2;
  const wallOffset = halfExtent + wallThickness / 2;
  const longWallSize: [number, number, number] = [
    size + wallThickness * 2,
    wallHeight,
    wallThickness,
  ];
  const sideWallSize: [number, number, number] = [wallThickness, wallHeight, size];
  const ceilingHeight = wallHeight;
  const triggerBoundaryPulse = useCallback((boundary: Boundary, payload: CollisionEnterPayload) => {
    pulseId.current += 1;
    const nextPulse = {
      id: pulseId.current,
      boundary,
      position: getCollisionPoint(boundary, payload, halfExtent, ceilingHeight),
    };

    setPulses((current) => [...current.slice(-3), nextPulse]);
  }, [ceilingHeight, halfExtent]);
  const removeBoundaryPulse = useCallback((id: number) => {
    setPulses((current) => current.filter((pulse) => pulse.id !== id));
  }, []);
  const floorTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = renderConfig.floorTexture.size;
    canvas.height = renderConfig.floorTexture.size;
    const context = canvas.getContext("2d");

    if (context) {
      const imageData = context.createImageData(canvas.width, canvas.height);
      imageData.data.set(createFloorTextureData({
        seed: renderConfig.floorTexture.seed,
        width: canvas.width,
        height: canvas.height,
        baseValue: renderConfig.floorTexture.baseValue,
        variation: renderConfig.floorTexture.variation,
        fiberStrength: renderConfig.floorTexture.fiberStrength,
        speckleStrength: renderConfig.floorTexture.speckleStrength,
      }));
      context.putImageData(imageData, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(renderConfig.floorTexture.repeat, renderConfig.floorTexture.repeat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, []);

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      restitution={floor.restitution}
      friction={floor.friction}
    >
      <CuboidCollider
        args={[halfExtent, floor.colliderHalfHeight, halfExtent]}
        position={[0, -floor.colliderHalfHeight, 0]}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <CuboidCollider
        args={[longWallSize[0] / 2, wallHeight / 2, wallThickness / 2]}
        position={[0, wallY, -wallOffset]}
        onCollisionEnter={(payload) => triggerBoundaryPulse("north", payload)}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <CuboidCollider
        args={[longWallSize[0] / 2, wallHeight / 2, wallThickness / 2]}
        position={[0, wallY, wallOffset]}
        onCollisionEnter={(payload) => triggerBoundaryPulse("south", payload)}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <CuboidCollider
        args={[wallThickness / 2, wallHeight / 2, sideWallSize[2] / 2]}
        position={[-wallOffset, wallY, 0]}
        onCollisionEnter={(payload) => triggerBoundaryPulse("west", payload)}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <CuboidCollider
        args={[wallThickness / 2, wallHeight / 2, sideWallSize[2] / 2]}
        position={[wallOffset, wallY, 0]}
        onCollisionEnter={(payload) => triggerBoundaryPulse("east", payload)}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <CuboidCollider
        args={[halfExtent, floor.ceilingHalfHeight, halfExtent]}
        position={[0, ceilingHeight + floor.ceilingHalfHeight, 0]}
        onCollisionEnter={(payload) => triggerBoundaryPulse("ceiling", payload)}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[size, size, 96, 96]} />
        <meshStandardMaterial
          color={renderConfig.palette.floor}
          map={floorTexture}
          roughness={0.96}
          metalness={0}
        />
      </mesh>
      {pulses.map((pulse) => (
        <BoundaryPulseMesh
          key={pulse.id}
          boundary={pulse.boundary}
          position={pulse.position}
          duration={floor.boundaryPulseDuration}
          onDone={() => removeBoundaryPulse(pulse.id)}
        />
      ))}
    </RigidBody>
  );
}
