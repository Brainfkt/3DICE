import * as THREE from "three";
import { physicsWorldConfig } from "../physics/config";
import { renderConfig } from "../render/config";

export type TopViewLayout = {
  boundaryHalfDepth: number;
  boundaryHalfWidth: number;
  cameraDistance: number;
  cameraPosition: [number, number, number];
  visibleHalfDepth: number;
  visibleHalfWidth: number;
};

export type TopViewThrowPlan = {
  direction: [number, number, number];
  position: [number, number, number];
  targetDistance: number;
};

export function getTopViewLayout(viewportAspect: number): TopViewLayout {
  const camera = renderConfig.camera.topView;
  const bounds = physicsWorldConfig.topViewBounds;
  const safeAspect = Number.isFinite(viewportAspect)
    ? Math.min(Math.max(viewportAspect, 0.25), 4)
    : 1;
  const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const cameraDistance = Math.max(
    camera.baseDistance,
    camera.minimumVisibleHalfWidth / (halfFovTangent * safeAspect),
  );
  const visibleHalfDepth = cameraDistance * halfFovTangent;
  const visibleHalfWidth = visibleHalfDepth * safeAspect;

  return {
    boundaryHalfDepth: Math.max(
      bounds.minimumHalfDepth,
      visibleHalfDepth - bounds.screenMargin,
    ),
    boundaryHalfWidth: Math.max(
      bounds.minimumHalfWidth,
      visibleHalfWidth - bounds.screenMargin,
    ),
    cameraDistance,
    cameraPosition: [
      camera.lookAt[0],
      camera.lookAt[1] + cameraDistance,
      camera.lookAt[2],
    ],
    visibleHalfDepth,
    visibleHalfWidth,
  };
}

export function getTopViewThrowPlans({
  count,
  initialHeight,
  layout,
  random = Math.random,
}: {
  count: number;
  initialHeight: number;
  layout: TopViewLayout;
  random?: () => number;
}): TopViewThrowPlan[] {
  const bounds = physicsWorldConfig.topViewBounds;
  const safeCount = Math.max(Math.floor(count), 0);
  const firstSide = Math.floor(Math.min(Math.max(random(), 0), 0.999999) * 4);
  const sideStep = safeCount === 2 ? 2 : 1;

  return Array.from({ length: safeCount }, (_, index) => {
    const side = (firstSide + index * sideStep) % 4;
    const edgeOffset = (Math.min(Math.max(random(), 0), 1) * 2 - 1) * 0.62;
    const targetX =
      (Math.min(Math.max(random(), 0), 1) * 2 - 1) * bounds.entryTargetRadius;
    const targetZ =
      (Math.min(Math.max(random(), 0), 1) * 2 - 1) * bounds.entryTargetRadius;
    const outsideX = layout.visibleHalfWidth + bounds.entrySpawnMargin;
    const outsideZ = layout.visibleHalfDepth + bounds.entrySpawnMargin;
    let x = 0;
    let z = 0;

    if (side === 0 || side === 2) {
      x = edgeOffset * layout.boundaryHalfWidth;
      z = side === 0 ? -outsideZ : outsideZ;
    } else {
      x = side === 1 ? outsideX : -outsideX;
      z = edgeOffset * layout.boundaryHalfDepth;
    }

    const directionX = targetX - x;
    const directionZ = targetZ - z;
    const directionLength = Math.max(Math.hypot(directionX, directionZ), 0.001);

    return {
      direction: [directionX / directionLength, 0, directionZ / directionLength],
      position: [x, initialHeight, z],
      targetDistance: directionLength,
    };
  });
}
