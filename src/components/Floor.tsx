import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PhysicsProfile } from "../physics/config";
import { renderConfig } from "../render/config";
import { createFloorPbrTextures } from "../render/floorTexture";

type FloorProps = {
  physicsProfile: PhysicsProfile;
};

const OPEN_WORLD_HALF_EXTENT = 1024;
const FLOOR_NORMAL_SCALE = new THREE.Vector2(
  renderConfig.materials.floor.normalScale,
  renderConfig.materials.floor.normalScale,
);

export function Floor({ physicsProfile }: FloorProps) {
  const floor = physicsProfile.floor;
  const size = OPEN_WORLD_HALF_EXTENT * 2;
  const gl = useThree((state) => state.gl);
  const floorTextures = useMemo(
    () =>
      createFloorPbrTextures(
        {
          seed: renderConfig.floorTexture.seed,
          width: renderConfig.floorTexture.size,
          height: renderConfig.floorTexture.size,
          baseValue: renderConfig.floorTexture.baseValue,
          variation: renderConfig.floorTexture.variation,
          fiberStrength: renderConfig.floorTexture.fiberStrength,
          speckleStrength: renderConfig.floorTexture.speckleStrength,
        },
        {
          anisotropy: Math.min(gl.capabilities.getMaxAnisotropy(), 4),
          repeat: renderConfig.floorTexture.repeat,
        },
      ),
    [gl],
  );

  useEffect(
    () => () => {
      floorTextures.map.dispose();
      floorTextures.normalMap.dispose();
      floorTextures.roughnessMap.dispose();
    },
    [floorTextures],
  );

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
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
          color={renderConfig.palette.floor}
          map={floorTextures.map}
          normalMap={floorTextures.normalMap}
          normalScale={FLOOR_NORMAL_SCALE}
          roughness={renderConfig.materials.floor.roughness}
          roughnessMap={floorTextures.roughnessMap}
          metalness={0}
        />
      </mesh>
    </RigidBody>
  );
}
