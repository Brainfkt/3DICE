import * as THREE from "three";

export type DiceRotation =
  | THREE.Quaternion
  | {
      x: number;
      y: number;
      z: number;
      w: number;
    };

export const diceFaceDefinitions = [
  { value: 1, localNormal: new THREE.Vector3(0, 1, 0) },
  { value: 6, localNormal: new THREE.Vector3(0, -1, 0) },
  { value: 2, localNormal: new THREE.Vector3(0, 0, 1) },
  { value: 5, localNormal: new THREE.Vector3(0, 0, -1) },
  { value: 3, localNormal: new THREE.Vector3(1, 0, 0) },
  { value: 4, localNormal: new THREE.Vector3(-1, 0, 0) },
] as const;

const worldUp = new THREE.Vector3(0, 1, 0);
type DiceFaceDefinition = (typeof diceFaceDefinitions)[number];

export function detectDiceFace(rotation: DiceRotation) {
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  let topFace: DiceFaceDefinition = diceFaceDefinitions[0];
  let strongestDot = -Infinity;

  for (const face of diceFaceDefinitions) {
    const worldNormal = face.localNormal.clone().applyQuaternion(quaternion);
    const dot = worldNormal.dot(worldUp);

    if (dot > strongestDot) {
      strongestDot = dot;
      topFace = face;
    }
  }

  return topFace.value;
}
