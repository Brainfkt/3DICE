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

describe("polyhedral dice", () => {
  it.each(polyhedralTypes)("creates a convex labelled %s", (type) => {
    const definition = getPolyhedralDieDefinition(type)!;
    expect(definition.faces).toHaveLength(Number(type.slice(1)));
    expect(definition.colliderVertices.length).toBeGreaterThanOrEqual(12);
    expect(definition.colliderVertices.length % 3).toBe(0);
    expect(getDieInitialHeight(type)).toBeGreaterThan(0.5);
    expect(definition.geometry.getAttribute("position").count).toBeGreaterThan(0);
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

  it("keeps the production d6 detector unchanged", () => {
    expect(detectDieFace("d6", new THREE.Quaternion())).toBe(1);
    expect(getPolyhedralDieDefinition("d6")).toBeNull();
  });
});
