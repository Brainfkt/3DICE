import * as THREE from "three";
import { DiceTypeId } from "../settings/config";
import { DiceRotation, detectDiceFace } from "../utils/detectDiceFace";

export type PolyhedralFace = {
  center: THREE.Vector3;
  localNormal: THREE.Vector3;
  value: number;
};

export type PolyhedralDieDefinition = {
  colliderVertices: Float32Array;
  faces: readonly PolyhedralFace[];
  geometry: THREE.BufferGeometry;
  initialHeight: number;
  labelScale: number;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const definitions = new Map<DiceTypeId, PolyhedralDieDefinition>();

function uniqueVertices(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const values: number[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const key = `${x.toFixed(5)}:${y.toFixed(5)}:${z.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(x, y, z);
  }

  return new Float32Array(values);
}

function extractPlanarFaces(geometry: THREE.BufferGeometry) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = nonIndexed.getAttribute("position");
  const groups: Array<{
    center: THREE.Vector3;
    count: number;
    normal: THREE.Vector3;
    plane: number;
  }> = [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    ab.copy(b).sub(a);
    ac.copy(c).sub(a);
    normal.crossVectors(ab, ac).normalize();
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (normal.dot(center) < 0) normal.multiplyScalar(-1);
    const plane = normal.dot(center);
    const group = groups.find(
      (candidate) =>
        candidate.normal.dot(normal) > 0.9995 &&
        Math.abs(candidate.plane - plane) < 0.002,
    );

    if (group) {
      group.center.add(center);
      group.count += 1;
    } else {
      groups.push({
        center: center.clone(),
        count: 1,
        normal: normal.clone(),
        plane,
      });
    }
  }

  nonIndexed.dispose();

  return groups
    .map((group) => ({
      center: group.center.multiplyScalar(1 / group.count),
      localNormal: group.normal,
    }))
    .sort((left, right) => {
      const leftAngle = Math.atan2(left.center.z, left.center.x);
      const rightAngle = Math.atan2(right.center.z, right.center.x);
      return right.center.y - left.center.y || leftAngle - rightAngle;
    });
}

function createD10Geometry(radius: number) {
  const vertices: number[] = [0, radius, 0, 0, -radius, 0];
  const ringRadius = radius * 0.92;
  const ringY = 0;
  const sides = 5;

  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2 - Math.PI / 2;
    vertices.push(
      Math.cos(angle) * ringRadius,
      ringY,
      Math.sin(angle) * ringRadius,
    );
  }

  const indices: number[] = [];
  for (let index = 0; index < sides; index += 1) {
    const current = 2 + index;
    const next = 2 + ((index + 1) % sides);
    indices.push(0, next, current);
    indices.push(1, current, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createGeometry(type: Exclude<DiceTypeId, "d6">) {
  const radius = type === "d4" ? 0.73 : type === "d10" ? 0.7 : 0.66;
  switch (type) {
    case "d4":
      return new THREE.TetrahedronGeometry(radius, 0);
    case "d8":
      return new THREE.OctahedronGeometry(radius, 0);
    case "d10":
      return createD10Geometry(radius);
    case "d12":
      return new THREE.DodecahedronGeometry(radius, 0);
    case "d20":
      return new THREE.IcosahedronGeometry(radius, 0);
  }
}

function createDefinition(type: Exclude<DiceTypeId, "d6">) {
  const geometry = createGeometry(type);
  geometry.computeVertexNormals();
  const rawFaces = extractPlanarFaces(geometry);
  const expectedFaces = Number(type.slice(1));

  if (rawFaces.length !== expectedFaces) {
    throw new Error(
      `Invalid ${type} geometry: expected ${expectedFaces} faces, received ${rawFaces.length}`,
    );
  }

  geometry.computeBoundingSphere();
  const initialHeight = (geometry.boundingSphere?.radius ?? 0.7) + 0.035;
  const labelScale = type === "d20"
    ? 0.17
    : type === "d12"
      ? 0.2
      : type === "d10"
        ? 0.22
        : type === "d8"
          ? 0.24
          : 0.27;

  return {
    colliderVertices: uniqueVertices(geometry),
    faces: rawFaces.map((face, index) => ({ ...face, value: index + 1 })),
    geometry,
    initialHeight,
    labelScale,
  } satisfies PolyhedralDieDefinition;
}

export function getPolyhedralDieDefinition(type: DiceTypeId) {
  if (type === "d6") return null;
  const cached = definitions.get(type);
  if (cached) return cached;
  const definition = createDefinition(type);
  definitions.set(type, definition);
  return definition;
}

export function getDieInitialHeight(type: DiceTypeId) {
  return type === "d6" ? 0.58 : getPolyhedralDieDefinition(type)!.initialHeight;
}

export function detectDieFace(type: DiceTypeId, rotation: DiceRotation) {
  if (type === "d6") return detectDiceFace(rotation);

  const quaternion = new THREE.Quaternion(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );
  const definition = getPolyhedralDieDefinition(type)!;
  let result = definition.faces[0];
  let strongestDot = -Infinity;

  for (const face of definition.faces) {
    const dot = face.localNormal.clone().applyQuaternion(quaternion).dot(WORLD_UP);
    if (dot <= strongestDot) continue;
    strongestDot = dot;
    result = face;
  }

  return result.value;
}
