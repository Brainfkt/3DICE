import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PhysicsProfile, physicsWorldConfig } from "../physics/config";
import { renderConfig } from "../render/config";
import { createFloorPbrTextures } from "../render/floorTexture";
import { SurfaceTheme } from "../settings/config";

type FloorProps = {
  physicsProfile: PhysicsProfile;
  surface: SurfaceTheme;
};

const FLOOR_NORMAL_SCALE = new THREE.Vector2(
  renderConfig.materials.floor.normalScale,
  renderConfig.materials.floor.normalScale,
);

type FloorSurfaceProps = {
  repeat: number;
  size: number;
  surface: SurfaceTheme;
};

export function FloorSurface({ repeat, size, surface }: FloorSurfaceProps) {
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
          repeat,
        },
      ),
    [gl, repeat],
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
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        color={surface.floor}
        map={floorTextures.map}
        normalMap={floorTextures.normalMap}
        normalScale={FLOOR_NORMAL_SCALE}
        roughness={renderConfig.materials.floor.roughness}
        roughnessMap={floorTextures.roughnessMap}
        metalness={0}
      />
    </mesh>
  );
}

export function Floor({ physicsProfile, surface }: FloorProps) {
  const floor = physicsProfile.floor;
  const size = physicsWorldConfig.openWorldHalfExtent * 2;

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      restitution={floor.restitution}
      friction={floor.friction}
    >
      <CuboidCollider
        args={[
          physicsWorldConfig.openWorldHalfExtent,
          floor.colliderHalfHeight,
          physicsWorldConfig.openWorldHalfExtent,
        ]}
        position={[0, -floor.colliderHalfHeight, 0]}
        restitution={floor.restitution}
        friction={floor.friction}
      />
      <FloorSurface
        repeat={renderConfig.floorTexture.repeat}
        size={size}
        surface={surface}
      />
    </RigidBody>
  );
}
