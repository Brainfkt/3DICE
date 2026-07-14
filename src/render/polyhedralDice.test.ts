import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { diceTypeOptions, DiceTypeId } from "../settings/config";
import {
  detectDieFace,
  getDieInitialHeight,
  getPolyhedralDieDefinition,
} from "./polyhedralDice";

const polyhedralTypes = diceTypeOptions
  .map((option) => option.id)
  .filter((type): type is Exclude<DiceTypeId, "d6"> => type !== "d6");

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
  it.each(polyhedralTypes)("creates a convex labelled %s", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    expect(definition.faces).toHaveLength(Number(type.slice(1)));
    expect(definition.colliderVertices.length).toBeGreaterThanOrEqual(12);
    expect(definition.colliderVertices.length % 3).toBe(0);
    expect(getDieInitialHeight(type)).toBeGreaterThan(0.5);
    expect(definition.geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it.each(polyhedralTypes)("uses textured body UVs and recessed numerals on %s", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    expectCompleteGeometry(definition.bodyGeometry);
    expectCompleteGeometry(definition.engravingGeometry);
    expect(definition.engravingMetrics).toHaveLength(definition.faces.length);

    for (const metric of definition.engravingMetrics) {
      expect(metric.surfacePlane - metric.bottomPlane).toBeCloseTo(0.022, 5);
      expect(metric.glyphHeight).toBeGreaterThan(0.14);
      expect(metric.glyphHeight).toBeLessThanOrEqual(definition.labelHeight + 1e-6);
      expect(metric.glyphWidth).toBeGreaterThan(0.03);
      expect(metric.contourCount).toBeGreaterThan(0);
    }
  });

  it.each(polyhedralTypes)("detects every labelled face of %s", (type) => {
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
