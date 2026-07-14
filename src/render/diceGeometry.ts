import * as THREE from "three";
import { diceFaceDefinitions } from "../utils/detectDiceFace";
import { createPipPositions, getFaceTransform } from "../utils/dicePips";

export type RecessedDiceGeometryConfig = {
  edgeRadius: number;
  pipDepth: number;
  pipOffset: number;
  pipPaintRadius: number;
  pipRadius: number;
  segments: number;
  size: number;
};

export type PipIndentation = {
  depth: number;
  gradientU: number;
  gradientV: number;
  painted: boolean;
};

type FaceSurface = {
  normal: THREE.Vector3;
  pipPositions: ReturnType<typeof createPipPositions>;
  u: THREE.Vector3;
  v: THREE.Vector3;
  value: number;
};

type GeometryBuffers = {
  indices: number[];
  normals: number[];
  positions: number[];
  uvs: number[];
};

type SurfaceSample = {
  normal: THREE.Vector3;
  position: THREE.Vector3;
  uv: THREE.Vector2;
};

const AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
] as const;
const MIN_PIP_SEGMENTS = 12;
const MAX_PIP_SEGMENTS = 20;
const MIN_EDGE_SEGMENTS = 4;
const MAX_EDGE_SEGMENTS = 8;
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createFaceSurfaces(pipOffset: number): FaceSurface[] {
  return diceFaceDefinitions.map(({ value, localNormal }) => {
    const normal = localNormal.clone().normalize();
    const { u, v } = getFaceTransform(normal);

    return {
      normal,
      pipPositions: createPipPositions(value, pipOffset),
      u,
      v,
      value,
    };
  });
}

function getPipRingPhase(
  faceValue: number,
  pipIndex: number,
  pipSegments: number,
) {
  const phaseFraction =
    ((faceValue * 7 + pipIndex) * GOLDEN_RATIO_CONJUGATE) % 1;
  return (phaseFraction * Math.PI * 2) / pipSegments;
}

function getRadialIndentation(
  distance: number,
  config: Pick<RecessedDiceGeometryConfig, "pipDepth" | "pipRadius">,
) {
  if (!Number.isFinite(distance) || distance >= config.pipRadius) {
    return { depth: 0, radialGradient: 0 };
  }

  const normalizedDistance = clampNumber(distance / config.pipRadius, 0, 1);

  return {
    depth:
      config.pipDepth * 0.5 *
      (1 + Math.cos(Math.PI * normalizedDistance)),
    radialGradient:
      (-config.pipDepth * Math.PI *
        Math.sin(Math.PI * normalizedDistance)) /
      (2 * config.pipRadius),
  };
}

export function getPipIndentation(
  value: number,
  u: number,
  v: number,
  config: Pick<
    RecessedDiceGeometryConfig,
    "pipDepth" | "pipOffset" | "pipPaintRadius" | "pipRadius"
  >,
): PipIndentation {
  let nearestU = 0;
  let nearestV = 0;
  let nearestDistanceSquared = Infinity;

  for (const [pipU, pipV] of createPipPositions(value, config.pipOffset)) {
    const deltaU = u - pipU;
    const deltaV = v - pipV;
    const distanceSquared = deltaU * deltaU + deltaV * deltaV;

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestU = deltaU;
      nearestV = deltaV;
    }
  }

  const distance = Math.sqrt(nearestDistanceSquared);
  const { depth, radialGradient } = getRadialIndentation(distance, config);
  if (depth === 0) {
    return { depth: 0, gradientU: 0, gradientV: 0, painted: false };
  }

  const inverseDistance = distance > Number.EPSILON ? 1 / distance : 0;

  return {
    depth,
    gradientU: radialGradient * nearestU * inverseDistance,
    gradientV: radialGradient * nearestV * inverseDistance,
    painted: distance <= config.pipPaintRadius,
  };
}

function createBuffers(): GeometryBuffers {
  return { indices: [], normals: [], positions: [], uvs: [] };
}

function appendVertex(
  target: GeometryBuffers,
  position: THREE.Vector3,
  normal: THREE.Vector3,
  uv: THREE.Vector2,
) {
  const index = target.positions.length / 3;
  target.positions.push(position.x, position.y, position.z);
  target.normals.push(normal.x, normal.y, normal.z);
  target.uvs.push(uv.x, uv.y);
  return index;
}

function readPosition(target: GeometryBuffers, index: number, result: THREE.Vector3) {
  const offset = index * 3;
  return result.set(
    target.positions[offset],
    target.positions[offset + 1],
    target.positions[offset + 2],
  );
}

function readNormal(target: GeometryBuffers, index: number, result: THREE.Vector3) {
  const offset = index * 3;
  return result.set(
    target.normals[offset],
    target.normals[offset + 1],
    target.normals[offset + 2],
  );
}

const triangleA = new THREE.Vector3();
const triangleB = new THREE.Vector3();
const triangleC = new THREE.Vector3();
const triangleEdgeA = new THREE.Vector3();
const triangleEdgeB = new THREE.Vector3();
const triangleNormal = new THREE.Vector3();
const expectedNormal = new THREE.Vector3();
const vertexNormalA = new THREE.Vector3();
const vertexNormalB = new THREE.Vector3();
const vertexNormalC = new THREE.Vector3();

function appendOrientedTriangle(
  target: GeometryBuffers,
  a: number,
  b: number,
  c: number,
) {
  readPosition(target, a, triangleA);
  readPosition(target, b, triangleB);
  readPosition(target, c, triangleC);
  triangleEdgeA.subVectors(triangleB, triangleA);
  triangleEdgeB.subVectors(triangleC, triangleA);
  triangleNormal.crossVectors(triangleEdgeA, triangleEdgeB);
  readNormal(target, a, vertexNormalA);
  readNormal(target, b, vertexNormalB);
  readNormal(target, c, vertexNormalC);
  expectedNormal
    .copy(vertexNormalA)
    .add(vertexNormalB)
    .add(vertexNormalC);

  if (triangleNormal.dot(expectedNormal) < 0) {
    target.indices.push(a, c, b);
  } else {
    target.indices.push(a, b, c);
  }
}

function appendQuad(
  target: GeometryBuffers,
  a: number,
  b: number,
  c: number,
  d: number,
) {
  appendOrientedTriangle(target, a, b, c);
  appendOrientedTriangle(target, b, d, c);
}

function createGeometry(buffers: GeometryBuffers, name: string) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(buffers.positions, 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(buffers.normals, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function getObjectUv(
  position: THREE.Vector3,
  normal: THREE.Vector3,
  faces: FaceSurface[],
  size: number,
) {
  let face = faces[0];
  let strongestDot = -Infinity;

  for (const candidate of faces) {
    const dot = candidate.normal.dot(normal);
    if (dot > strongestDot) {
      strongestDot = dot;
      face = candidate;
    }
  }

  return new THREE.Vector2(
    position.dot(face.u) / size + 0.5,
    position.dot(face.v) / size + 0.5,
  );
}

function getFacePosition(
  face: FaceSurface,
  halfSize: number,
  localU: number,
  localV: number,
  depth = 0,
) {
  return face.normal
    .clone()
    .multiplyScalar(halfSize - depth)
    .addScaledVector(face.u, localU)
    .addScaledVector(face.v, localV);
}

function appendFaceCap(
  target: GeometryBuffers,
  face: FaceSurface,
  halfSize: number,
  innerHalfSize: number,
  pipRadius: number,
  pipSegments: number,
  size: number,
) {
  const contour = [
    new THREE.Vector2(-innerHalfSize, -innerHalfSize),
    new THREE.Vector2(innerHalfSize, -innerHalfSize),
    new THREE.Vector2(innerHalfSize, innerHalfSize),
    new THREE.Vector2(-innerHalfSize, innerHalfSize),
  ];
  const holes = face.pipPositions.map(([pipU, pipV], pipIndex) =>
    Array.from({ length: pipSegments }, (_, index) => {
      const angle =
        ((index + 0.5) / pipSegments) * Math.PI * 2 +
        getPipRingPhase(face.value, pipIndex, pipSegments);
      return new THREE.Vector2(
        pipU + Math.cos(angle) * pipRadius,
        pipV + Math.sin(angle) * pipRadius,
      );
    }),
  );
  const points = [...contour, ...holes.flat()];
  const vertexIndices = points.map((point) => {
    const position = getFacePosition(face, halfSize, point.x, point.y);
    return appendVertex(
      target,
      position,
      face.normal,
      getObjectUv(position, face.normal, [face], size),
    );
  });

  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
    appendOrientedTriangle(
      target,
      vertexIndices[a],
      vertexIndices[b],
      vertexIndices[c],
    );
  }
}

function createRecessSample(
  face: FaceSurface,
  pipU: number,
  pipV: number,
  radius: number,
  angle: number,
  halfSize: number,
  size: number,
  config: Pick<RecessedDiceGeometryConfig, "pipDepth" | "pipRadius">,
): SurfaceSample {
  const radialU = Math.cos(angle);
  const radialV = Math.sin(angle);
  const { depth, radialGradient } = getRadialIndentation(radius, config);
  const position = getFacePosition(
    face,
    halfSize,
    pipU + radialU * radius,
    pipV + radialV * radius,
    depth,
  );
  const normal = face.normal
    .clone()
    .addScaledVector(face.u, radialGradient * radialU)
    .addScaledVector(face.v, radialGradient * radialV)
    .normalize();

  return {
    normal,
    position,
    uv: getObjectUv(position, face.normal, [face], size),
  };
}

function appendRing(
  target: GeometryBuffers,
  face: FaceSurface,
  pipU: number,
  pipV: number,
  radius: number,
  phase: number,
  pipSegments: number,
  halfSize: number,
  size: number,
  config: Pick<RecessedDiceGeometryConfig, "pipDepth" | "pipRadius">,
) {
  return Array.from({ length: pipSegments }, (_, index) => {
    const sample = createRecessSample(
      face,
      pipU,
      pipV,
      radius,
      ((index + 0.5) / pipSegments) * Math.PI * 2 + phase,
      halfSize,
      size,
      config,
    );
    return appendVertex(target, sample.position, sample.normal, sample.uv);
  });
}

function connectRings(
  target: GeometryBuffers,
  outer: number[],
  inner: number[],
) {
  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length;
    appendQuad(
      target,
      outer[index],
      outer[next],
      inner[index],
      inner[next],
    );
  }
}

function appendRecess(
  body: GeometryBuffers,
  pips: GeometryBuffers,
  face: FaceSurface,
  pipU: number,
  pipV: number,
  phase: number,
  halfSize: number,
  pipRadius: number,
  paintRadius: number,
  pipSegments: number,
  size: number,
  config: Pick<RecessedDiceGeometryConfig, "pipDepth" | "pipRadius">,
) {
  const lipRadii = [pipRadius, (pipRadius + paintRadius) * 0.5, paintRadius];
  const lipRings = lipRadii.map((radius) =>
    appendRing(
      body,
      face,
      pipU,
      pipV,
      radius,
      phase,
      pipSegments,
      halfSize,
      size,
      config,
    ),
  );
  connectRings(body, lipRings[0], lipRings[1]);
  connectRings(body, lipRings[1], lipRings[2]);

  const bowlRadii = [paintRadius, paintRadius * 0.75, paintRadius * 0.5, paintRadius * 0.25];
  const bowlRings = bowlRadii.map((radius) =>
    appendRing(
      pips,
      face,
      pipU,
      pipV,
      radius,
      phase,
      pipSegments,
      halfSize,
      size,
      config,
    ),
  );

  for (let index = 0; index < bowlRings.length - 1; index += 1) {
    connectRings(pips, bowlRings[index], bowlRings[index + 1]);
  }

  const centerSample = createRecessSample(
    face,
    pipU,
    pipV,
    0,
    0,
    halfSize,
    size,
    config,
  );
  const center = appendVertex(
    pips,
    centerSample.position,
    centerSample.normal,
    centerSample.uv,
  );
  const innerRing = bowlRings[bowlRings.length - 1];
  for (let index = 0; index < innerRing.length; index += 1) {
    appendOrientedTriangle(
      pips,
      innerRing[index],
      innerRing[(index + 1) % innerRing.length],
      center,
    );
  }
}

function appendRoundedEdges(
  target: GeometryBuffers,
  innerHalfSize: number,
  edgeRadius: number,
  edgeSegments: number,
  faces: FaceSurface[],
  size: number,
) {
  for (let parallelAxis = 0; parallelAxis < 3; parallelAxis += 1) {
    const transverseAxes = [0, 1, 2].filter(
      (axis) => axis !== parallelAxis,
    );
    const firstAxis = transverseAxes[0];
    const secondAxis = transverseAxes[1];

    for (const firstSign of [-1, 1]) {
      for (const secondSign of [-1, 1]) {
        const rows: number[][] = [];

        for (const parallelSign of [-1, 1]) {
          const core = new THREE.Vector3();
          core.setComponent(parallelAxis, parallelSign * innerHalfSize);
          core.setComponent(firstAxis, firstSign * innerHalfSize);
          core.setComponent(secondAxis, secondSign * innerHalfSize);
          const row: number[] = [];

          for (let segment = 0; segment <= edgeSegments; segment += 1) {
            const t = segment / edgeSegments;
            const normal = AXES[firstAxis]
              .clone()
              .multiplyScalar(firstSign * (1 - t))
              .addScaledVector(AXES[secondAxis], secondSign * t)
              .normalize();
            const position = core.clone().addScaledVector(normal, edgeRadius);
            row.push(
              appendVertex(
                target,
                position,
                normal,
                getObjectUv(position, normal, faces, size),
              ),
            );
          }

          rows.push(row);
        }

        for (let segment = 0; segment < edgeSegments; segment += 1) {
          appendQuad(
            target,
            rows[0][segment],
            rows[0][segment + 1],
            rows[1][segment],
            rows[1][segment + 1],
          );
        }
      }
    }
  }
}

function appendRoundedCorners(
  target: GeometryBuffers,
  innerHalfSize: number,
  edgeRadius: number,
  edgeSegments: number,
  faces: FaceSurface[],
  size: number,
) {
  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const core = new THREE.Vector3(
          signX * innerHalfSize,
          signY * innerHalfSize,
          signZ * innerHalfSize,
        );
        const rows: number[][] = [];

        for (let x = 0; x <= edgeSegments; x += 1) {
          const row: number[] = [];
          for (let y = 0; y <= edgeSegments - x; y += 1) {
            const z = edgeSegments - x - y;
            const normal = new THREE.Vector3(
              signX * x,
              signY * y,
              signZ * z,
            ).normalize();
            const position = core.clone().addScaledVector(normal, edgeRadius);
            row.push(
              appendVertex(
                target,
                position,
                normal,
                getObjectUv(position, normal, faces, size),
              ),
            );
          }
          rows.push(row);
        }

        for (let x = 0; x < edgeSegments; x += 1) {
          for (let y = 0; y < edgeSegments - x; y += 1) {
            appendOrientedTriangle(
              target,
              rows[x][y],
              rows[x + 1][y],
              rows[x][y + 1],
            );

            if (y < edgeSegments - x - 1) {
              appendOrientedTriangle(
                target,
                rows[x + 1][y],
                rows[x + 1][y + 1],
                rows[x][y + 1],
              );
            }
          }
        }
      }
    }
  }
}

export function createRecessedDiceGeometries(
  config: RecessedDiceGeometryConfig,
) {
  const size = Math.max(Math.abs(config.size), 0.001);
  const halfSize = size / 2;
  const edgeRadius = clampNumber(
    Math.abs(config.edgeRadius),
    0.001,
    halfSize - 0.001,
  );
  const innerHalfSize = halfSize - edgeRadius;
  const pipRadius = clampNumber(
    Math.abs(config.pipRadius),
    0.001,
    innerHalfSize * 0.45,
  );
  const paintRadius = clampNumber(
    Math.abs(config.pipPaintRadius),
    pipRadius * 0.05,
    pipRadius * 0.999,
  );
  const pipSegments = clampNumber(
    Math.floor(config.segments),
    MIN_PIP_SEGMENTS,
    MAX_PIP_SEGMENTS,
  );
  const edgeSegments = clampNumber(
    Math.ceil(pipSegments * 0.4),
    MIN_EDGE_SEGMENTS,
    MAX_EDGE_SEGMENTS,
  );
  const faces = createFaceSurfaces(config.pipOffset);

  for (const face of faces) {
    for (const [pipU, pipV] of face.pipPositions) {
      if (
        Math.abs(pipU) + pipRadius >= innerHalfSize ||
        Math.abs(pipV) + pipRadius >= innerHalfSize
      ) {
        throw new Error("Pip recess extends beyond the flat dice face");
      }
    }
  }

  const geometryConfig = {
    pipDepth: Math.max(config.pipDepth, 0),
    pipRadius,
  };
  const body = createBuffers();
  const pips = createBuffers();

  for (const face of faces) {
    appendFaceCap(
      body,
      face,
      halfSize,
      innerHalfSize,
      pipRadius,
      pipSegments,
      size,
    );

    face.pipPositions.forEach(([pipU, pipV], pipIndex) => {
      appendRecess(
        body,
        pips,
        face,
        pipU,
        pipV,
        getPipRingPhase(face.value, pipIndex, pipSegments),
        halfSize,
        pipRadius,
        paintRadius,
        pipSegments,
        size,
        geometryConfig,
      );
    });
  }

  appendRoundedEdges(
    body,
    innerHalfSize,
    edgeRadius,
    edgeSegments,
    faces,
    size,
  );
  appendRoundedCorners(
    body,
    innerHalfSize,
    edgeRadius,
    edgeSegments,
    faces,
    size,
  );

  return {
    body: createGeometry(body, "dice-body"),
    pips: createGeometry(pips, "dice-pips"),
  };
}
