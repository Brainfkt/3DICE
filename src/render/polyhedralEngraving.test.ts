import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createEngravedPolyhedralGeometries,
  createNumberGlyphs,
} from "./polyhedralEngraving";

function expectFiniteAttribute(attribute: THREE.BufferAttribute) {
  expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
}

describe("polyhedral numeral engraving", () => {
  it.each([
    [1, 1, 0],
    [8, 1, 2],
    [10, 2, 1],
    [20, 2, 1],
  ])("creates a bold vector outline for %i", (value, glyphCount, holeCount) => {
    const glyphs = createNumberGlyphs(value, 0.4);
    const points = glyphs.flatMap((glyph) => [glyph.contour, ...glyph.holes]).flat();
    const height = Math.max(...points.map((point) => point.y)) -
      Math.min(...points.map((point) => point.y));

    expect(glyphs).toHaveLength(glyphCount);
    expect(glyphs.reduce((sum, glyph) => sum + glyph.holes.length, 0)).toBe(
      holeCount,
    );
    expect(height).toBeCloseTo(0.4, 5);
    expect(points.every((point) => Number.isFinite(point.x + point.y))).toBe(true);
  });

  it("builds recessed bottoms, sloped walls and planar UVs", () => {
    const depth = 0.04;
    const result = createEngravedPolyhedralGeometries({
      depth,
      faces: [
        {
          center: new THREE.Vector3(0, 0, 0),
          localNormal: new THREE.Vector3(0, 0, 1),
          value: 8,
          vertices: [
            new THREE.Vector3(-1, -1, 0),
            new THREE.Vector3(1, -1, 0),
            new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(-1, 1, 0),
          ],
        },
      ],
      margin: 0.1,
      requestedHeight: 0.8,
    });
    const bodyPosition = result.body.getAttribute("position") as THREE.BufferAttribute;
    const bodyNormal = result.body.getAttribute("normal") as THREE.BufferAttribute;
    const bodyUv = result.body.getAttribute("uv") as THREE.BufferAttribute;
    const engravingPosition = result.engraving.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const engravingUv = result.engraving.getAttribute("uv") as THREE.BufferAttribute;
    const bodyDepths = Array.from(
      { length: bodyPosition.count },
      (_, index) => bodyPosition.getZ(index),
    );
    const engravingDepths = Array.from(
      { length: engravingPosition.count },
      (_, index) => engravingPosition.getZ(index),
    );

    expect(bodyPosition.count).toBeGreaterThan(12);
    expect(engravingPosition.count).toBeGreaterThan(6);
    expect(Math.max(...bodyDepths)).toBeCloseTo(0, 5);
    expect(Math.min(...bodyDepths)).toBeCloseTo(-depth, 5);
    expect(Math.max(...engravingDepths)).toBeCloseTo(-depth, 5);
    expect(Math.min(...engravingDepths)).toBeCloseTo(-depth, 5);
    expect(bodyUv.count).toBe(bodyPosition.count);
    expect(engravingUv.count).toBe(engravingPosition.count);
    expectFiniteAttribute(bodyPosition);
    expectFiniteAttribute(bodyNormal);
    expectFiniteAttribute(bodyUv);
    expectFiniteAttribute(engravingPosition);
    expectFiniteAttribute(engravingUv);
    expect(result.metrics[0]).toMatchObject({ contourCount: 3, value: 8 });
    expect(result.metrics[0].surfacePlane - result.metrics[0].bottomPlane).toBeCloseTo(
      depth,
      5,
    );
  });
});
