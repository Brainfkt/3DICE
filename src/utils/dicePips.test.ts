import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { diceFaceDefinitions } from "./detectDiceFace";
import { createFacePipLayout, createPipPositions, getFaceTransform } from "./dicePips";

const PIP_OFFSET = 0.235;
const HALF_SIZE = 0.56;

function keyForPosition(position: THREE.Vector3) {
  return [position.x, position.y, position.z].map((value) => value.toFixed(4)).join(",");
}

describe("createPipPositions", () => {
  it("creates the expected number of pips for each face value", () => {
    for (let value = 1; value <= 6; value += 1) {
      expect(createPipPositions(value, PIP_OFFSET)).toHaveLength(value);
    }
  });
});

describe("getFaceTransform", () => {
  it("creates valid tangent axes for every dice face", () => {
    for (const face of diceFaceDefinitions) {
      const normal = face.localNormal.clone().normalize();
      const { u, v } = getFaceTransform(normal);

      expect(Number.isFinite(u.x + u.y + u.z)).toBe(true);
      expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
      expect(u.length()).toBeCloseTo(1, 5);
      expect(v.length()).toBeCloseTo(1, 5);
      expect(Math.abs(u.dot(normal))).toBeLessThan(0.00001);
      expect(Math.abs(v.dot(normal))).toBeLessThan(0.00001);
      expect(Math.abs(u.dot(v))).toBeLessThan(0.00001);
    }
  });
});

describe("createFacePipLayout", () => {
  it("keeps every pip distinct on all faces, including the 4 face", () => {
    for (const face of diceFaceDefinitions) {
      const layout = createFacePipLayout(face.value, face.localNormal, HALF_SIZE, PIP_OFFSET, 0.004);
      const uniquePositions = new Set(layout.map(({ position }) => keyForPosition(position)));

      expect(uniquePositions.size).toBe(face.value);
    }
  });
});
