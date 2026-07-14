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

type FloorSurfaceProps = {
  repeat: number;
  size: number;
  surface: SurfaceTheme;
};

export function FloorSurface({ repeat, size, surface }: FloorSurfaceProps) {
  const gl = useThree((state) => state.gl);
  const textureProfile = useMemo(() => {
    switch (surface.texture) {
      case "wood":
        return { variation: 14, fiberStrength: 16, speckleStrength: 3, seedOffset: 17 };
      case "stone":
        return { variation: 12, fiberStrength: 2, speckleStrength: 18, seedOffset: 31 };
      case "glass":
        return { variation: 4, fiberStrength: 1, speckleStrength: 4, seedOffset: 47 };
      default:
        return { variation: 7, fiberStrength: 9, speckleStrength: 5, seedOffset: 0 };
    }
  }, [surface.texture]);
  const floorTextures = useMemo(
    () =>
      createFloorPbrTextures(
        {
          seed: renderConfig.floorTexture.seed + textureProfile.seedOffset,
          width: renderConfig.floorTexture.size,
          height: renderConfig.floorTexture.size,
          baseValue: renderConfig.floorTexture.baseValue,
          variation: textureProfile.variation,
          fiberStrength: textureProfile.fiberStrength,
          speckleStrength: textureProfile.speckleStrength,
        },
        {
          anisotropy: Math.min(gl.capabilities.getMaxAnisotropy(), 4),
          repeat,
        },
      ),
    [gl, repeat, textureProfile],
  );
  const normalScale = useMemo(
    () => new THREE.Vector2(surface.normalScale, surface.normalScale),
    [surface.normalScale],
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
        normalScale={normalScale}
        roughness={surface.roughness}
        roughnessMap={floorTextures.roughnessMap}
        metalness={surface.metalness}
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
        repeat={surface.repeat}
        size={size}
        surface={surface}
      />
    </RigidBody>
  );
}
