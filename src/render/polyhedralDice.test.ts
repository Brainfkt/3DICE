import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { diceTypeOptions, DiceTypeId } from "../settings/config";
import {
  detectDieFace,
  getDieInitialHeight,
  getPolyhedralDieDefinition,
  POLYHEDRAL_DIE_SCALE,
} from "./polyhedralDice";

const polyhedralTypes = diceTypeOptions
  .map((option) => option.id)
  .filter((type): type is Exclude<DiceTypeId, "d6"> => type !== "d6");
const faceReadTypes = polyhedralTypes.filter((type) => type !== "d4");

function getPlanarFaceAreas(type: Exclude<DiceTypeId, "d6">) {
  const definition = getPolyhedralDieDefinition(type)!;
  const geometry = definition.geometry.index
    ? definition.geometry.toNonIndexed()
    : definition.geometry.clone();
  const position = geometry.getAttribute("position");
  const areas = definition.faces.map(() => 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (normal.dot(center) < 0) normal.multiplyScalar(-1);

    const faceIndex = definition.faces.reduce(
      (bestIndex, face, candidateIndex) =>
        face.localNormal.dot(normal) >
        definition.faces[bestIndex].localNormal.dot(normal)
          ? candidateIndex
          : bestIndex,
      0,
    );
    areas[faceIndex] += new THREE.Triangle(a, b, c).getArea();
  }

  geometry.dispose();
  return areas;
}

function expectCompleteGeometry(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;

  expect(position.count).toBeGreaterThan(0);
  expect(normal.count).toBe(position.count);
  expect(uv.count).toBe(position.count);
  for (const attribute of [position, normal, uv]) {
    expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
  }
}

describe("polyhedral dice", () => {
  it.each(polyhedralTypes)("keeps the %s silhouette near the d6 visual envelope", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    const d6BoundingRadius = (Math.sqrt(3) * 1.12) / 2;
    const radius = definition.geometry.boundingSphere!.radius;

    expect(radius / d6BoundingRadius).toBeGreaterThan(0.79);
    expect(radius / d6BoundingRadius).toBeLessThan(0.9);
  });

  it.each(polyhedralTypes)("uses subtly rounded visuals and a stable collider on %s", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    const sharpRadius = definition.geometry.boundingSphere!.radius;
    const colliderPosition = new THREE.BufferAttribute(
      definition.colliderVertices,
      3,
    );
    let roundedRadius = 0;

    for (let index = 0; index < colliderPosition.count; index += 1) {
      roundedRadius = Math.max(
        roundedRadius,
        new THREE.Vector3()
          .fromBufferAttribute(colliderPosition, index)
          .length(),
      );
    }

    expect(definition.bodyGeometry.getAttribute("position").count).toBeGreaterThan(
      definition.geometry.getAttribute("position").count,
    );

    if (type === "d4") {
      expect(roundedRadius / sharpRadius).toBeCloseTo(1, 5);
      expect(definition.colliderVertices.length / 3).toBe(4);
    } else {
      expect(roundedRadius / sharpRadius).toBeGreaterThan(0.94);
      expect(roundedRadius / sharpRadius).toBeLessThan(0.995);
      expect(definition.colliderVertices.length / 3).toBeGreaterThan(
        definition.geometry.getAttribute("position").count,
      );
    }
  });

  it.each(polyhedralTypes)("creates a convex labelled %s", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    expect(definition.faces).toHaveLength(Number(type.slice(1)));
    expect(definition.colliderVertices.length).toBeGreaterThanOrEqual(12);
    expect(definition.colliderVertices.length % 3).toBe(0);
    expect(getDieInitialHeight(type)).toBeGreaterThan(0.5);
    expect(definition.geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("builds d10 as a pentagonal trapezohedron with ten kite faces", () => {
    const definition = getPolyhedralDieDefinition("d10")!;
    const vertexCount = definition.geometry.getAttribute("position").count;
    const triangleCount = definition.geometry.index!.count / 3;

    expect(vertexCount).toBe(12);
    expect(triangleCount).toBe(20);
    expect(definition.faces).toHaveLength(10);
    expect(definition.faces.every((face) => face.vertices.length === 4)).toBe(
      true,
    );
  });

  it.each(polyhedralTypes)("uses textured body UVs and recessed numerals on %s", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    expectCompleteGeometry(definition.bodyGeometry);
    expectCompleteGeometry(definition.engravingGeometry);
    expect(definition.engravingMetrics).toHaveLength(
      type === "d4" ? 12 : definition.faces.length,
    );

    for (const metric of definition.engravingMetrics) {
      expect(metric.surfacePlane - metric.bottomPlane).toBeCloseTo(
        0.022 * POLYHEDRAL_DIE_SCALE,
        5,
      );
      expect(metric.glyphHeight).toBeGreaterThan(0.14);
      expect(metric.glyphHeight).toBeLessThanOrEqual(definition.labelHeight + 1e-6);
      expect(metric.glyphWidth).toBeGreaterThan(0.03);
      expect(metric.contourCount).toBeGreaterThan(0);
    }
  });

  it("repeats each d4 result on the three faces adjacent to its vertex", () => {
    const definition = getPolyhedralDieDefinition("d4")!;

    expect(definition.resultVertices).toHaveLength(4);
    for (const value of [1, 2, 3, 4]) {
      expect(
        definition.engravingMetrics.filter((metric) => metric.value === value),
      ).toHaveLength(3);
    }
  });

  it("detects the d4 result from its highest labelled vertex", () => {
    const definition = getPolyhedralDieDefinition("d4")!;
    const up = new THREE.Vector3(0, 1, 0);

    for (const vertex of definition.resultVertices) {
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        vertex.localPosition.clone().normalize(),
        up,
      );
      expect(detectDieFace("d4", rotation)).toBe(vertex.value);
    }
  });

  it("gives the d4 a canonical face-down resting orientation", () => {
    const definition = getPolyhedralDieDefinition("d4")!;
    const downwardFace = definition.faces.reduce((lowest, face) =>
      face.localNormal.y < lowest.localNormal.y ? face : lowest,
    );
    const vertexHeights = definition.resultVertices
      .map((vertex) => vertex.localPosition.y)
      .sort((left, right) => left - right);

    expect(downwardFace.localNormal.y).toBeCloseTo(-1, 5);
    expect(vertexHeights[0]).toBeCloseTo(vertexHeights[1], 5);
    expect(vertexHeights[1]).toBeCloseTo(vertexHeights[2], 5);
    expect(vertexHeights[2]).toBeLessThan(0);
    expect(vertexHeights[3]).toBeGreaterThan(0);
  });

  it.each(faceReadTypes)("detects every labelled face of %s", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    const up = new THREE.Vector3(0, 1, 0);

    for (const face of definition.faces) {
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        face.localNormal,
        up,
      );
      expect(detectDieFace(type, rotation)).toBe(face.value);
    }
  });

  it.each(polyhedralTypes)("keeps equal landing-face areas on %s", (type) => {
    const areas = getPlanarFaceAreas(type);
    const average = areas.reduce((sum, area) => sum + area, 0) / areas.length;
    const largestDeviation = Math.max(
      ...areas.map((area) => Math.abs(area - average) / average),
    );

    expect(largestDeviation).toBeLessThan(0.001);
  });

  it("keeps the production d6 detector unchanged", () => {
    expect(detectDieFace("d6", new THREE.Quaternion())).toBe(1);
    expect(getPolyhedralDieDefinition("d6")).toBeNull();
  });
});
