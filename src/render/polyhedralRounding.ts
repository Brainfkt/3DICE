import * as THREE from "three";

export type RoundedPolyhedralFace = {
  center: THREE.Vector3;
  localNormal: THREE.Vector3;
  value: number;
  vertices: readonly THREE.Vector3[];
};

export type RoundedPolyhedralSurface = {
  colliderVertices: Float32Array;
  edgeGeometry: THREE.BufferGeometry;
  faces: readonly RoundedPolyhedralFace[];
};

type EdgeUse = {
  faceIndex: number;
  pointsByVertex: Map<string, THREE.Vector3>;
};

type EdgeEntry = {
  firstVertexKey: string;
  secondVertexKey: string;
  uses: EdgeUse[];
};

type BoundaryPoint = {
  normal: THREE.Vector3;
  position: THREE.Vector3;
};

type GeometryBuffers = {
  normals: number[];
  positions: number[];
  uvs: number[];
};

function pointKey(point: THREE.Vector3) {
  return `${point.x.toFixed(6)}:${point.y.toFixed(6)}:${point.z.toFixed(6)}`;
}

function edgeKey(firstVertexKey: string, secondVertexKey: string) {
  return firstVertexKey < secondVertexKey
    ? `${firstVertexKey}|${secondVertexKey}`
    : `${secondVertexKey}|${firstVertexKey}`;
}

function getProjectionUv(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  scale: number,
) {
  const absoluteNormal = new THREE.Vector3(
    Math.abs(normal.x),
    Math.abs(normal.y),
    Math.abs(normal.z),
  );
  let u: number;
  let v: number;

  if (absoluteNormal.x >= absoluteNormal.y && absoluteNormal.x >= absoluteNormal.z) {
    u = point.z;
    v = point.y;
  } else if (absoluteNormal.y >= absoluteNormal.z) {
    u = point.x;
    v = point.z;
  } else {
    u = point.x;
    v = point.y;
  }

  return [u * scale + 0.5, v * scale + 0.5] as const;
}

function appendTriangle(
  buffers: GeometryBuffers,
  inputPositions: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  inputNormals: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  uvScale: number,
) {
  const positions = inputPositions.map((point) => point.clone()) as [
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
  ];
  const normals = inputNormals.map((normal) => normal.clone()) as [
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
  ];
  const triangleNormal = new THREE.Vector3()
    .crossVectors(
      positions[1].clone().sub(positions[0]),
      positions[2].clone().sub(positions[0]),
    )
    .normalize();
  const triangleCenter = positions[0]
    .clone()
    .add(positions[1])
    .add(positions[2]);

  if (triangleNormal.dot(triangleCenter) < 0) {
    [positions[1], positions[2]] = [positions[2], positions[1]];
    [normals[1], normals[2]] = [normals[2], normals[1]];
  }

  for (let index = 0; index < 3; index += 1) {
    const point = positions[index];
    const normal = normals[index];
    const uv = getProjectionUv(point, normal, uvScale);
    buffers.positions.push(point.x, point.y, point.z);
    buffers.normals.push(normal.x, normal.y, normal.z);
    buffers.uvs.push(uv[0], uv[1]);
  }
}

function appendQuad(
  buffers: GeometryBuffers,
  firstStart: BoundaryPoint,
  firstEnd: BoundaryPoint,
  secondStart: BoundaryPoint,
  secondEnd: BoundaryPoint,
  uvScale: number,
) {
  appendTriangle(
    buffers,
    [firstStart.position, firstEnd.position, secondEnd.position],
    [firstStart.normal, firstEnd.normal, secondEnd.normal],
    uvScale,
  );
  appendTriangle(
    buffers,
    [firstStart.position, secondEnd.position, secondStart.position],
    [firstStart.normal, secondEnd.normal, secondStart.normal],
    uvScale,
  );
}

function createEdgeGeometry(buffers: GeometryBuffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = "polyhedral-dice-rounded-edges";
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(buffers.positions, 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(buffers.normals, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function getPointForVertex(use: EdgeUse, vertexKey: string) {
  const point = use.pointsByVertex.get(vertexKey);
  if (!point) throw new Error(`Missing inset point for vertex ${vertexKey}`);
  return point;
}

function addCornerBoundaryPoint(
  corners: Map<string, Map<string, BoundaryPoint>>,
  vertexKey: string,
  pointId: string,
  point: BoundaryPoint,
) {
  const corner = corners.get(vertexKey) ?? new Map<string, BoundaryPoint>();
  corner.set(pointId, point);
  corners.set(vertexKey, corner);
}

function getOrderedCornerBoundary(
  points: readonly BoundaryPoint[],
  center: THREE.Vector3,
  axis: THREE.Vector3,
) {
  const reference = Math.abs(axis.y) < 0.88
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(reference, axis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();

  return [...points].sort((left, right) => {
    const leftRelative = left.position.clone().sub(center);
    const rightRelative = right.position.clone().sub(center);
    return (
      Math.atan2(leftRelative.dot(v), leftRelative.dot(u)) -
      Math.atan2(rightRelative.dot(v), rightRelative.dot(u))
    );
  });
}

function uniqueColliderVertices(points: readonly THREE.Vector3[]) {
  const seen = new Set<string>();
  const values: number[] = [];

  for (const point of points) {
    const key = pointKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(point.x, point.y, point.z);
  }

  return new Float32Array(values);
}

export function createRoundedPolyhedralSurface(
  faces: readonly RoundedPolyhedralFace[],
  insetRatio: number,
  bulgeRatio = 0.45,
): RoundedPolyhedralSurface {
  const clampedInset = THREE.MathUtils.clamp(insetRatio, 0.001, 0.25);
  const clampedBulge = THREE.MathUtils.clamp(bulgeRatio, 0, 0.9);
  const roundedFaces = faces.map((face) => ({
    ...face,
    center: face.center.clone(),
    localNormal: face.localNormal.clone(),
    vertices: face.vertices.map((vertex) =>
      vertex.clone().lerp(face.center, clampedInset),
    ),
  }));
  const originalVertices = new Map<string, THREE.Vector3>();
  const edges = new Map<string, EdgeEntry>();
  const corners = new Map<string, Map<string, BoundaryPoint>>();
  const colliderPoints: THREE.Vector3[] = [];
  const buffers: GeometryBuffers = { normals: [], positions: [], uvs: [] };

  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const originalFace = faces[faceIndex];
    const roundedFace = roundedFaces[faceIndex];
    for (let vertexIndex = 0; vertexIndex < originalFace.vertices.length; vertexIndex += 1) {
      const nextIndex = (vertexIndex + 1) % originalFace.vertices.length;
      const firstOriginal = originalFace.vertices[vertexIndex];
      const secondOriginal = originalFace.vertices[nextIndex];
      const firstKey = pointKey(firstOriginal);
      const secondKey = pointKey(secondOriginal);
      const key = edgeKey(firstKey, secondKey);
      const entry = edges.get(key) ?? {
        firstVertexKey: firstKey < secondKey ? firstKey : secondKey,
        secondVertexKey: firstKey < secondKey ? secondKey : firstKey,
        uses: [],
      };

      originalVertices.set(firstKey, firstOriginal.clone());
      originalVertices.set(secondKey, secondOriginal.clone());
      entry.uses.push({
        faceIndex,
        pointsByVertex: new Map([
          [firstKey, roundedFace.vertices[vertexIndex].clone()],
          [secondKey, roundedFace.vertices[nextIndex].clone()],
        ]),
      });
      edges.set(key, entry);
    }

    colliderPoints.push(...roundedFace.vertices.map((point) => point.clone()));
  }

  const maximumRadius = Math.max(
    ...[...originalVertices.values()].map((point) => point.length()),
  );
  const uvScale = 1 / Math.max(maximumRadius * 2, Number.EPSILON);

  for (const [key, edge] of edges) {
    if (edge.uses.length !== 2) {
      throw new Error(`Polyhedral edge ${key} belongs to ${edge.uses.length} faces`);
    }

    const firstUse = edge.uses[0];
    const secondUse = edge.uses[1];
    const firstFace = roundedFaces[firstUse.faceIndex];
    const secondFace = roundedFaces[secondUse.faceIndex];
    const middleNormal = firstFace.localNormal
      .clone()
      .add(secondFace.localNormal)
      .normalize();
    const makeCrossSection = (vertexKey: string) => {
      const first = getPointForVertex(firstUse, vertexKey);
      const second = getPointForVertex(secondUse, vertexKey);
      const original = originalVertices.get(vertexKey)!;
      const middle = first
        .clone()
        .lerp(second, 0.5)
        .lerp(original, clampedBulge);
      colliderPoints.push(middle.clone());
      addCornerBoundaryPoint(corners, vertexKey, `face:${firstUse.faceIndex}`, {
        normal: firstFace.localNormal,
        position: first,
      });
      addCornerBoundaryPoint(corners, vertexKey, `edge:${key}`, {
        normal: middleNormal,
        position: middle,
      });
      addCornerBoundaryPoint(corners, vertexKey, `face:${secondUse.faceIndex}`, {
        normal: secondFace.localNormal,
        position: second,
      });
      return { first, middle, second };
    };
    const firstSection = makeCrossSection(edge.firstVertexKey);
    const secondSection = makeCrossSection(edge.secondVertexKey);

    appendQuad(
      buffers,
      { normal: firstFace.localNormal, position: firstSection.first },
      { normal: firstFace.localNormal, position: secondSection.first },
      { normal: middleNormal, position: firstSection.middle },
      { normal: middleNormal, position: secondSection.middle },
      uvScale,
    );
    appendQuad(
      buffers,
      { normal: middleNormal, position: firstSection.middle },
      { normal: middleNormal, position: secondSection.middle },
      { normal: secondFace.localNormal, position: firstSection.second },
      { normal: secondFace.localNormal, position: secondSection.second },
      uvScale,
    );
  }

  for (const [vertexKey, cornerPoints] of corners) {
    const original = originalVertices.get(vertexKey)!;
    const boundary = [...cornerPoints.values()];
    const boundaryCenter = boundary
      .reduce(
        (center, point) => center.add(point.position),
        new THREE.Vector3(),
      )
      .multiplyScalar(1 / boundary.length);
    const center = boundaryCenter.clone().lerp(original, clampedBulge);
    const centerNormal = boundary
      .reduce(
        (normal, point) => normal.add(point.normal),
        new THREE.Vector3(),
      )
      .normalize();
    const orderedBoundary = getOrderedCornerBoundary(
      boundary,
      boundaryCenter,
      centerNormal,
    );

    colliderPoints.push(center.clone());
    for (let index = 0; index < orderedBoundary.length; index += 1) {
      const nextIndex = (index + 1) % orderedBoundary.length;
      appendTriangle(
        buffers,
        [
          center,
          orderedBoundary[index].position,
          orderedBoundary[nextIndex].position,
        ],
        [
          centerNormal,
          orderedBoundary[index].normal,
          orderedBoundary[nextIndex].normal,
        ],
        uvScale,
      );
    }
  }

  return {
    colliderVertices: uniqueColliderVertices(colliderPoints),
    edgeGeometry: createEdgeGeometry(buffers),
    faces: roundedFaces,
  };
}
