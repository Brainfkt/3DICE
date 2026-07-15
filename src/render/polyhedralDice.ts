import * as THREE from "three";
import { DiceTypeId } from "../settings/config";
import { DiceRotation, detectDiceFace } from "../utils/detectDiceFace";
import {
  createEngravedPolyhedralGeometries,
  EngravingMetric,
} from "./polyhedralEngraving";

export type PolyhedralFace = {
  center: THREE.Vector3;
  localNormal: THREE.Vector3;
  value: number;
  vertices: readonly THREE.Vector3[];
};

export type PolyhedralDieDefinition = {
  bodyGeometry: THREE.BufferGeometry;
  colliderVertices: Float32Array;
  engravingGeometry: THREE.BufferGeometry;
  engravingMetrics: readonly EngravingMetric[];
  faces: readonly PolyhedralFace[];
  geometry: THREE.BufferGeometry;
  initialHeight: number;
  labelHeight: number;
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

function uniquePointList(points: readonly THREE.Vector3[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x.toFixed(5)}:${point.y.toFixed(5)}:${point.z.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getConvexFaceVertices(
  points: readonly THREE.Vector3[],
  normal: THREE.Vector3,
) {
  const unique = uniquePointList(points);
  const center = unique
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .multiplyScalar(1 / unique.length);
  const reference = Math.abs(normal.y) < 0.88
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);
  const axisU = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const axisV = new THREE.Vector3().crossVectors(normal, axisU).normalize();
  const projected = unique
    .map((point) => {
      const relative = point.clone().sub(center);
      return {
        point,
        x: relative.dot(axisU),
        y: relative.dot(axisV),
      };
    })
    .sort((left, right) => left.x - right.x || left.y - right.y);
  const cross = (
    origin: (typeof projected)[number],
    left: (typeof projected)[number],
    right: (typeof projected)[number],
  ) =>
    (left.x - origin.x) * (right.y - origin.y) -
    (left.y - origin.y) * (right.x - origin.x);
  const lower: typeof projected = [];
  for (const point of projected) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: typeof projected = [];
  for (let index = projected.length - 1; index >= 0; index -= 1) {
    const point = projected[index];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper].map((entry) => entry.point.clone());
}

function extractPlanarFaces(geometry: THREE.BufferGeometry) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = nonIndexed.getAttribute("position");
  const groups: Array<{
    center: THREE.Vector3;
    count: number;
    normal: THREE.Vector3;
    plane: number;
    points: THREE.Vector3[];
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
      group.points.push(a.clone(), b.clone(), c.clone());
    } else {
      groups.push({
        center: center.clone(),
        count: 1,
        normal: normal.clone(),
        plane,
        points: [a.clone(), b.clone(), c.clone()],
      });
    }
  }

  nonIndexed.dispose();

  return groups
    .map((group) => {
      const vertices = getConvexFaceVertices(group.points, group.normal);
      return {
        center: vertices
          .reduce((sum, point) => sum.add(point), new THREE.Vector3())
          .multiplyScalar(1 / vertices.length),
        localNormal: group.normal,
        vertices,
      };
    })
    .sort((left, right) => {
      const leftAngle = Math.atan2(left.center.z, left.center.x);
      const rightAngle = Math.atan2(right.center.z, right.center.x);
      return right.center.y - left.center.y || leftAngle - rightAngle;
    });
}

function createD10Geometry(radius: number) {
  const vertices: number[] = [0, radius, 0, 0, -radius, 0];
  const sides = 5;
  const beltVertexCount = sides * 2;
  const beltRadius = radius * 0.88;
  const halfStepAngle = Math.PI / sides;
  const beltOffset =
    radius *
    ((1 - Math.cos(halfStepAngle)) / (1 + Math.cos(halfStepAngle)));

  // A d10 is a pentagonal trapezohedron: two poles plus a ten-vertex
  // zig-zag belt. The alternating belt heights make each pair of triangles
  // exactly coplanar, producing ten congruent kite faces rather than the ten
  // triangular faces of a pentagonal bipyramid.
  for (let index = 0; index < beltVertexCount; index += 1) {
    const angle = (index / beltVertexCount) * Math.PI * 2 - Math.PI / 2;
    vertices.push(
      Math.cos(angle) * beltRadius,
      index % 2 === 0 ? -beltOffset : beltOffset,
      Math.sin(angle) * beltRadius,
    );
  }

  const indices: number[] = [];
  for (let index = 0; index < beltVertexCount; index += 1) {
    const current = 2 + index;
    const previous = 2 + ((index - 1 + beltVertexCount) % beltVertexCount);
    const next = 2 + ((index + 1) % beltVertexCount);

    if (index % 2 === 0) {
      indices.push(0, next, current, 0, current, previous);
    } else {
      indices.push(1, previous, current, 1, current, next);
    }
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
  const labelHeight = type === "d20"
    ? 0.27
    : type === "d12"
      ? 0.3
      : type === "d10"
        ? 0.32
        : type === "d8"
          ? 0.32
          : 0.34;
  const faces = rawFaces.map((face, index) => ({ ...face, value: index + 1 }));
  const engraved = createEngravedPolyhedralGeometries({
    depth: 0.022,
    faces,
    margin: 0.018,
    requestedHeight: labelHeight,
  });

  return {
    bodyGeometry: engraved.body,
    colliderVertices: uniqueVertices(geometry),
    engravingGeometry: engraved.engraving,
    engravingMetrics: engraved.metrics,
    faces,
    geometry,
    initialHeight,
    labelHeight,
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
