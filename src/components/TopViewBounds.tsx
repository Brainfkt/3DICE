import { useThree } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import { getTopViewLayout } from "../game/topView";
import { PhysicsProfile, physicsWorldConfig } from "../physics/config";

export function TopViewBounds({
  physicsProfile,
}: {
  physicsProfile: PhysicsProfile;
}) {
  const { height, width } = useThree((state) => state.size);
  const layout = useMemo(
    () => getTopViewLayout(width / Math.max(height, 1)),
    [height, width],
  );
  const { wallHeight, wallThickness } = physicsWorldConfig.topViewBounds;
  const wallHalfHeight = wallHeight / 2;
  const wallHalfThickness = wallThickness / 2;
  const wallY = wallHalfHeight;
  const wallX = layout.boundaryHalfWidth + wallHalfThickness;
  const wallZ = layout.boundaryHalfDepth + wallHalfThickness;
  const floor = physicsProfile.floor;

  return (
    <RigidBody
      key={`${layout.boundaryHalfWidth}:${layout.boundaryHalfDepth}`}
      colliders={false}
      friction={floor.friction}
      restitution={floor.restitution}
      type="fixed"
    >
      <CuboidCollider
        args={[
          layout.boundaryHalfWidth + wallThickness,
          wallHalfHeight,
          wallHalfThickness,
        ]}
        friction={floor.friction}
        position={[0, wallY, -wallZ]}
        restitution={floor.restitution}
      />
      <CuboidCollider
        args={[
          layout.boundaryHalfWidth + wallThickness,
          wallHalfHeight,
          wallHalfThickness,
        ]}
        friction={floor.friction}
        position={[0, wallY, wallZ]}
        restitution={floor.restitution}
      />
      <CuboidCollider
        args={[
          wallHalfThickness,
          wallHalfHeight,
          layout.boundaryHalfDepth + wallThickness,
        ]}
        friction={floor.friction}
        position={[-wallX, wallY, 0]}
        restitution={floor.restitution}
      />
      <CuboidCollider
        args={[
          wallHalfThickness,
          wallHalfHeight,
          layout.boundaryHalfDepth + wallThickness,
        ]}
        friction={floor.friction}
        position={[wallX, wallY, 0]}
        restitution={floor.restitution}
      />
    </RigidBody>
  );
}
