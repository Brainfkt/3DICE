import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { diceFaceDefinitions } from "../utils/detectDiceFace";
import { createPipPositions, getFaceTransform } from "../utils/dicePips";
import {
  createRecessedDiceGeometries,
  getPipIndentation,
  RecessedDiceGeometryConfig,
} from "./diceGeometry";

const config: RecessedDiceGeometryConfig = {
  edgeRadius: 0.155,
  pipDepth: 0.052,
  pipOffset: 0.235,
  pipPaintRadius: 0.073,
  pipRadius: 0.105,
  segments: 12,
  size: 1.12,
};

const productionConfig: RecessedDiceGeometryConfig = {
  ...config,
  segments: 44,
};

function getTriangleCount(geometry: THREE.BufferGeometry) {
  return (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
}

function positionKey(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
) {
  return [positions.getX(index), positions.getY(index), positions.getZ(index)]
    .map((value) => Math.round(value * 1_000_000))
    .join(",");
}

function countWeldedEdges(geometries: THREE.BufferGeometry[]) {
  const edges = new Map<string, number>();

  for (const geometry of geometries) {
    const positions = geometry.getAttribute("position");
    const indices = geometry.index;
    if (!indices) throw new Error("Expected indexed dice geometry");

    for (let index = 0; index < indices.count; index += 3) {
      const triangle = [
        indices.getX(index),
        indices.getX(index + 1),
        indices.getX(index + 2),
      ];

      for (let edge = 0; edge < 3; edge += 1) {
        const a = positionKey(positions, triangle[edge]);
        const b = positionKey(positions, triangle[(edge + 1) % 3]);
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }

  return edges;
}

describe("getPipIndentation", () => {
  it("reaches full physical depth at every pip center", () => {
    for (let value = 1; value <= 6; value += 1) {
      for (const [u, v] of createPipPositions(value, config.pipOffset)) {
        const indentation = getPipIndentation(value, u, v, config);

        expect(indentation.depth).toBeCloseTo(config.pipDepth, 6);
        expect(indentation.gradientU).toBeCloseTo(0, 6);
        expect(indentation.gradientV).toBeCloseTo(0, 6);
        expect(indentation.painted).toBe(true);
      }
    }
  });

  it("joins the ivory face smoothly at the outer rim", () => {
    const [u, v] = createPipPositions(1, config.pipOffset)[0];
    const indentation = getPipIndentation(
      1,
      u + config.pipRadius,
      v,
      config,
    );

    expect(indentation).toEqual({
      depth: 0,
      gradientU: 0,
      gradientV: 0,
      painted: false,
    });
  });

  it("keeps flat face areas outside every recess", () => {
    expect(getPipIndentation(6, 0.48, 0.48, config).depth).toBe(0);
  });
});

describe("createRecessedDiceGeometries", () => {
  it("uses an adaptive indexed topology with a stable production budget", () => {
    const geometries = createRecessedDiceGeometries(productionConfig);

    expect(getTriangleCount(geometries.body)).toBe(2_858);
    expect(getTriangleCount(geometries.pips)).toBe(2_940);
    expect(getTriangleCount(geometries.body) + getTriangleCount(geometries.pips)).toBe(
      5_798,
    );
    expect(geometries.body.getAttribute("position").count).toBe(2_280);
    expect(geometries.pips.getAttribute("position").count).toBe(1_701);

    geometries.body.dispose();
    geometries.pips.dispose();
  });

  it("creates finite, unit-normalized and outward-facing triangles", () => {
    const geometries = createRecessedDiceGeometries(config);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const geometricNormal = new THREE.Vector3();
    const averageNormal = new THREE.Vector3();
    const vertexNormal = new THREE.Vector3();

    for (const geometry of [geometries.body, geometries.pips]) {
      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      const uvs = geometry.getAttribute("uv");
      const indices = geometry.index;
      expect(indices).not.toBeNull();
      if (!indices) continue;

      for (let index = 0; index < positions.count; index += 1) {
        a.fromBufferAttribute(positions, index);
        vertexNormal.fromBufferAttribute(normals, index);

        expect(a.toArray().every(Number.isFinite)).toBe(true);
        expect(vertexNormal.toArray().every(Number.isFinite)).toBe(true);
        expect(vertexNormal.length()).toBeCloseTo(1, 5);
        expect(Number.isFinite(uvs.getX(index))).toBe(true);
        expect(Number.isFinite(uvs.getY(index))).toBe(true);
      }

      for (let index = 0; index < indices.count; index += 3) {
        const indexA = indices.getX(index);
        const indexB = indices.getX(index + 1);
        const indexC = indices.getX(index + 2);
        a.fromBufferAttribute(positions, indexA);
        b.fromBufferAttribute(positions, indexB);
        c.fromBufferAttribute(positions, indexC);
        edgeA.subVectors(b, a);
        edgeB.subVectors(c, a);
        geometricNormal.crossVectors(edgeA, edgeB);
        averageNormal
          .fromBufferAttribute(normals, indexA)
          .add(vertexNormal.fromBufferAttribute(normals, indexB))
          .add(vertexNormal.fromBufferAttribute(normals, indexC));

        expect(
          geometricNormal.length(),
          `${geometry.name} triangle ${index / 3}: ${a.toArray()} / ${b.toArray()} / ${c.toArray()}`,
        ).toBeGreaterThan(1e-8);
        expect(geometricNormal.dot(averageNormal)).toBeGreaterThan(0);
      }
    }

    geometries.body.dispose();
    geometries.pips.dispose();
  });

  it("forms one closed surface after welding the material seam", () => {
    const geometries = createRecessedDiceGeometries(productionConfig);
    const edges = countWeldedEdges([geometries.body, geometries.pips]);

    expect(edges.size).toBeGreaterThan(0);
    expect([...edges.values()].filter((count) => count !== 2)).toEqual([]);

    geometries.body.dispose();
    geometries.pips.dispose();
  });

  it("contains all 21 physical bowl centers at the configured depth", () => {
    const geometries = createRecessedDiceGeometries(config);
    const positions = geometries.pips.getAttribute("position");
    const normals = geometries.pips.getAttribute("normal");
    const expectedSupport = config.size / 2 - config.pipDepth;

    for (const face of diceFaceDefinitions) {
      const normal = face.localNormal.clone().normalize();
      const { u, v } = getFaceTransform(normal);

      for (const [pipU, pipV] of createPipPositions(face.value, config.pipOffset)) {
        let closestDistance = Infinity;
        let closestSupport = Infinity;

        for (let index = 0; index < positions.count; index += 1) {
          const vertexNormal = new THREE.Vector3().fromBufferAttribute(normals, index);
          if (vertexNormal.dot(normal) < 0.99999) continue;

          const position = new THREE.Vector3().fromBufferAttribute(positions, index);
          const distance = Math.hypot(position.dot(u) - pipU, position.dot(v) - pipV);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestSupport = position.dot(normal);
          }
        }

        expect(closestDistance).toBeLessThan(1e-6);
        expect(closestSupport).toBeCloseTo(expectedSupport, 6);
      }
    }

    geometries.body.dispose();
    geometries.pips.dispose();
  });
});
