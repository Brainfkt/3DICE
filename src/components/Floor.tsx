import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import { PhysicsProfile } from "../physics/config";
import { renderConfig } from "../render/config";
import { createFloorNoiseDots } from "../render/floorTexture";

type FloorProps = {
  physicsProfile: PhysicsProfile;
};

const OPEN_WORLD_HALF_EXTENT = 1024;
const OPEN_WORLD_TEXTURE_REPEAT = 720;
const OPEN_WORLD_SEGMENTS = 128;

export function Floor({ physicsProfile }: FloorProps) {
  const floor = physicsProfile.floor;
  const size = OPEN_WORLD_HALF_EXTENT * 2;
  const floorTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = renderConfig.floorTexture.size;
    canvas.height = renderConfig.floorTexture.size;
    const context = canvas.getContext("2d");

    if (context) {
      context.fillStyle = "#2a2926";
      context.fillRect(0, 0, canvas.width, canvas.height);

      for (const dot of createFloorNoiseDots({
        seed: renderConfig.floorTexture.seed,
        count: renderConfig.floorTexture.noiseDots,
        width: canvas.width,
        height: canvas.height,
      })) {
        const value = dot.value;
        context.fillStyle = `rgba(${value}, ${value}, ${value - 3}, 0.22)`;
        context.fillRect(dot.x, dot.y, 1, 1);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(OPEN_WORLD_TEXTURE_REPEAT, OPEN_WORLD_TEXTURE_REPEAT);
    texture.colorSpace = THREE.SRGBColorSpace;
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
        args={[OPEN_WORLD_HALF_EXTENT, floor.colliderHalfHeight, OPEN_WORLD_HALF_EXTENT]}
        position={[0, -floor.colliderHalfHeight, 0]}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[size, size, OPEN_WORLD_SEGMENTS, OPEN_WORLD_SEGMENTS]} />
        <meshStandardMaterial
          color="#272623"
          map={floorTexture}
          bumpMap={floorTexture}
          bumpScale={0.018}
          roughness={0.86}
          metalness={0.02}
        />
      </mesh>
    </RigidBody>
  );
}
