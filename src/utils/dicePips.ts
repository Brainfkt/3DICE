import * as THREE from "three";

export type PipPosition2D = [number, number];

export function createPipPositions(value: number, offset: number): PipPosition2D[] {
  const center: PipPosition2D = [0, 0];
  const topLeft: PipPosition2D = [-offset, offset];
  const topRight: PipPosition2D = [offset, offset];
  const midLeft: PipPosition2D = [-offset, 0];
  const midRight: PipPosition2D = [offset, 0];
  const bottomLeft: PipPosition2D = [-offset, -offset];
  const bottomRight: PipPosition2D = [offset, -offset];

  switch (value) {
    case 1:
      return [center];
    case 2:
      return [topLeft, bottomRight];
    case 3:
      return [topLeft, center, bottomRight];
    case 4:
      return [topLeft, topRight, bottomLeft, bottomRight];
    case 5:
      return [topLeft, topRight, center, bottomLeft, bottomRight];
    case 6:
      return [topLeft, midLeft, bottomLeft, topRight, midRight, bottomRight];
    default:
      return [];
  }
}

export function getFaceTransform(normal: THREE.Vector3) {
  const faceNormal = normal.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    faceNormal,
  );
  const helper =
    Math.abs(faceNormal.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(helper, faceNormal).normalize();
  const v = new THREE.Vector3().crossVectors(faceNormal, u).normalize();

  return { quaternion, u, v };
}

export function createFacePipLayout(
  value: number,
  localNormal: THREE.Vector3,
  halfSize: number,
  pipOffset: number,
  surfaceOffset: number,
) {
  const normal = localNormal.clone().normalize();
  const { quaternion, u, v } = getFaceTransform(normal);

  return createPipPositions(value, pipOffset).map(([px, py]) => ({
    position: normal
      .clone()
      .multiplyScalar(halfSize + surfaceOffset)
      .add(u.clone().multiplyScalar(px))
      .add(v.clone().multiplyScalar(py)),
    quaternion,
  }));
}
