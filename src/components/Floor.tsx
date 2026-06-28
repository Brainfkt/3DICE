import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import { PhysicsProfile } from "../physics/config";
import { renderConfig } from "../render/config";
import { createFloorTextureData } from "../render/floorTexture";

type FloorProps = {
  physicsProfile: PhysicsProfile;
};

const OPEN_WORLD_HALF_EXTENT = 1024;
const OPEN_WORLD_SEGMENTS = 64;

export function Floor({ physicsProfile }: FloorProps) {
  const floor = physicsProfile.floor;
  const size = OPEN_WORLD_HALF_EXTENT * 2;
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
        args={[OPEN_WORLD_HALF_EXTENT, floor.colliderHalfHeight, OPEN_WORLD_HALF_EXTENT]}
        position={[0, -floor.colliderHalfHeight, 0]}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[size, size, OPEN_WORLD_SEGMENTS, OPEN_WORLD_SEGMENTS]} />
        <meshStandardMaterial
          color={renderConfig.palette.floor}
          map={floorTexture}
          roughness={0.96}
          metalness={0}
        />
      </mesh>
    </RigidBody>
  );
}
