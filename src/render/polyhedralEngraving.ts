import * as THREE from "three";
import helvetikerBold from "three/examples/fonts/helvetiker_bold.typeface.json";
import {
  FontData,
  FontLoader,
} from "three/examples/jsm/loaders/FontLoader.js";

export type EngravingFaceInput = {
  center: THREE.Vector3;
  localNormal: THREE.Vector3;
  value: number;
  vertices: readonly THREE.Vector3[];
};

export type EngravingMetric = {
  bottomPlane: number;
  contourCount: number;
  glyphHeight: number;
  glyphWidth: number;
  surfacePlane: number;
  value: number;
};

export type EngravedPolyhedralGeometries = {
  body: THREE.BufferGeometry;
  engraving: THREE.BufferGeometry;
  metrics: readonly EngravingMetric[];
};

type GeometryBuffers = {
  positions: number[];
  uvs: number[];
};

type FaceBasis = {
  u: THREE.Vector3;
  v: THREE.Vector3;
};

type NumberGlyph = {
  contour: THREE.Vector2[];
  holes: THREE.Vector2[][];
};

const numeralFont = new FontLoader().parse(
  helvetikerBold as unknown as FontData,
);
const CURVE_SEGMENTS = 3;
const BEVEL_RATIO = 0.09;

function getFaceBasis(normal: THREE.Vector3): FaceBasis {
  const reference = Math.abs(normal.y) < 0.88
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  return { u, v };
}

function toFacePoint(
  point: THREE.Vector2,
  face: EngravingFaceInput,
  basis: FaceBasis,
  depth = 0,
) {
  return face.center
    .clone()
    .addScaledVector(basis.u, point.x)
    .addScaledVector(basis.v, point.y)
    .addScaledVector(face.localNormal, -depth);
}

function projectToFace(
  point: THREE.Vector3,
  face: EngravingFaceInput,
  basis: FaceBasis,
) {
  const relative = point.clone().sub(face.center);
  return new THREE.Vector2(relative.dot(basis.u), relative.dot(basis.v));
}

function withoutClosingDuplicate(points: readonly THREE.Vector2[]) {
  const contour = points.map((point) => point.clone());
  if (
    contour.length > 2 &&
    contour[0].distanceToSquared(contour[contour.length - 1]) < 1e-12
  ) {
    contour.pop();
  }
  return contour;
}

export function createNumberGlyphs(value: number, height: number) {
  const glyphs = numeralFont.generateShapes(String(value), 1).map((shape) => {
    const points = shape.extractPoints(CURVE_SEGMENTS);
    return {
      contour: withoutClosingDuplicate(points.shape),
      holes: points.holes.map(withoutClosingDuplicate),
    };
  });
  const points = glyphs.flatMap((glyph) => [glyph.contour, ...glyph.holes]).flat();
  if (points.length === 0) return glyphs;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = height / Math.max(maxY - minY, Number.EPSILON);
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  for (const point of points) {
    point.set((point.x - centerX) * scale, (point.y - centerY) * scale);
  }
  return glyphs;
}

export function createNumberContours(value: number, height: number) {
  return createNumberGlyphs(value, height).flatMap((glyph) => [
    glyph.contour,
    ...glyph.holes,
  ]);
}

function distanceToSegment(
  point: THREE.Vector2,
  start: THREE.Vector2,
  end: THREE.Vector2,
) {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared <= Number.EPSILON) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(
    point.clone().sub(start).dot(segment) / lengthSquared,
    0,
    1,
  );
  return point.distanceTo(start.clone().addScaledVector(segment, t));
}

function isPointInsidePolygon(point: THREE.Vector2, polygon: readonly THREE.Vector2[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function glyphsFitFace(
  glyphs: readonly NumberGlyph[],
  faceContour: readonly THREE.Vector2[],
  margin: number,
) {
  const contours = glyphs.flatMap((glyph) => [glyph.contour, ...glyph.holes]);
  return contours.every((contour) =>
    contour.every((point) => {
      if (!isPointInsidePolygon(point, faceContour)) return false;
      for (let index = 0; index < faceContour.length; index += 1) {
        if (
          distanceToSegment(
            point,
            faceContour[index],
            faceContour[(index + 1) % faceContour.length],
          ) < margin
        ) {
          return false;
        }
      }
      return true;
    }),
  );
}

function fitNumberContours(
  value: number,
  requestedHeight: number,
  faceContour: readonly THREE.Vector2[],
  margin: number,
) {
  let height = requestedHeight;
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const glyphs = createNumberGlyphs(value, height);
    if (glyphsFitFace(glyphs, faceContour, margin)) {
      return { glyphs, height };
    }
    height *= 0.94;
  }
  throw new Error(`Unable to fit engraved value ${value} inside its face`);
}

function getBounds(points: readonly THREE.Vector2[]) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, maxX, minY, maxY };
}

function createUvMapper(faceContour: readonly THREE.Vector2[]) {
  const bounds = getBounds(faceContour);
  const width = Math.max(bounds.maxX - bounds.minX, 0.001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.001);
  return (point: THREE.Vector2) =>
    new THREE.Vector2(
      (point.x - bounds.minX) / width,
      (point.y - bounds.minY) / height,
    );
}

function appendTriangle(
  buffers: GeometryBuffers,
  points: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  uvs: readonly [THREE.Vector2, THREE.Vector2, THREE.Vector2],
  outward: THREE.Vector3,
) {
  const [a, b, c] = points;
  const windingNormal = new THREE.Vector3()
    .crossVectors(b.clone().sub(a), c.clone().sub(a));
  const order = windingNormal.dot(outward) >= 0 ? [0, 1, 2] : [0, 2, 1];
  for (const index of order) {
    const point = points[index];
    const uv = uvs[index];
    buffers.positions.push(point.x, point.y, point.z);
    buffers.uvs.push(uv.x, uv.y);
  }
}

function createGeometry(buffers: GeometryBuffers, name: string) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(buffers.positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function cloneContours(contours: readonly (readonly THREE.Vector2[])[]) {
  return contours.map((contour) => contour.map((point) => point.clone()));
}

function orientTriangulationContours(
  faceContour: readonly THREE.Vector2[],
  holes: readonly (readonly THREE.Vector2[])[],
) {
  const contour = faceContour.map((point) => point.clone());
  if (!THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const orientedHoles = cloneContours(holes);
  for (const hole of orientedHoles) {
    if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
  }
  return { contour, holes: orientedHoles };
}

function getContourCenter(contour: readonly THREE.Vector2[]) {
  return contour
    .reduce((sum, point) => sum.add(point), new THREE.Vector2())
    .multiplyScalar(1 / contour.length);
}

function bevelContour(
  contour: readonly THREE.Vector2[],
  direction: "expand" | "inset",
) {
  const center = getContourCenter(contour);
  return contour.map((point) =>
    point.clone().lerp(center, direction === "inset" ? BEVEL_RATIO : -BEVEL_RATIO),
  );
}

function appendPlanarTriangles(
  buffers: GeometryBuffers,
  contour: readonly THREE.Vector2[],
  holes: readonly (readonly THREE.Vector2[])[],
  face: EngravingFaceInput,
  basis: FaceBasis,
  uvFor: (point: THREE.Vector2) => THREE.Vector2,
  depth = 0,
) {
  const triangulation = orientTriangulationContours(contour, holes);
  const points2d = [triangulation.contour, ...triangulation.holes].flat();
  const triangles = THREE.ShapeUtils.triangulateShape(
    triangulation.contour,
    triangulation.holes,
  );

  for (const triangle of triangles) {
    appendTriangle(
      buffers,
      triangle.map((index) =>
        toFacePoint(points2d[index], face, basis, depth),
      ) as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
      triangle.map((index) => uvFor(points2d[index])) as [
        THREE.Vector2,
        THREE.Vector2,
        THREE.Vector2,
      ],
      face.localNormal,
    );
  }
}

function appendCavityWall(
  buffers: GeometryBuffers,
  surfaceContour: readonly THREE.Vector2[],
  bottomContour: readonly THREE.Vector2[],
  face: EngravingFaceInput,
  basis: FaceBasis,
  uvFor: (point: THREE.Vector2) => THREE.Vector2,
  depth: number,
  direction: "outward" | "toward-center",
) {
  const center = getContourCenter(surfaceContour);
  for (let index = 0; index < surfaceContour.length; index += 1) {
    const next = (index + 1) % surfaceContour.length;
    const surfaceA = toFacePoint(surfaceContour[index], face, basis);
    const surfaceB = toFacePoint(surfaceContour[next], face, basis);
    const bottomA = toFacePoint(bottomContour[index], face, basis, depth);
    const bottomB = toFacePoint(bottomContour[next], face, basis, depth);
    const midpoint = surfaceContour[index]
      .clone()
      .add(surfaceContour[next])
      .multiplyScalar(0.5);
    const wallDirection = direction === "toward-center"
      ? center.clone().sub(midpoint)
      : midpoint.clone().sub(center);
    const desiredWallNormal = basis.u
      .clone()
      .multiplyScalar(wallDirection.x)
      .addScaledVector(basis.v, wallDirection.y)
      .normalize();
    appendTriangle(
      buffers,
      [surfaceA, bottomA, bottomB],
      [
        uvFor(surfaceContour[index]),
        uvFor(bottomContour[index]),
        uvFor(bottomContour[next]),
      ],
      desiredWallNormal,
    );
    appendTriangle(
      buffers,
      [surfaceA, bottomB, surfaceB],
      [
        uvFor(surfaceContour[index]),
        uvFor(bottomContour[next]),
        uvFor(surfaceContour[next]),
      ],
      desiredWallNormal,
    );
  }
}

export function createEngravedPolyhedralGeometries({
  depth,
  faces,
  margin,
  requestedHeight,
}: {
  depth: number;
  faces: readonly EngravingFaceInput[];
  margin: number;
  requestedHeight: number;
}): EngravedPolyhedralGeometries {
  const body: GeometryBuffers = { positions: [], uvs: [] };
  const engraving: GeometryBuffers = { positions: [], uvs: [] };
  const metrics: EngravingMetric[] = [];

  for (const face of faces) {
    const basis = getFaceBasis(face.localNormal);
    const faceContour = face.vertices.map((vertex) =>
      projectToFace(vertex, face, basis),
    );
    const { glyphs, height } = fitNumberContours(
      face.value,
      requestedHeight,
      faceContour,
      margin,
    );
    const uvFor = createUvMapper(faceContour);
    appendPlanarTriangles(
      body,
      faceContour,
      glyphs.map((glyph) => glyph.contour),
      face,
      basis,
      uvFor,
    );

    for (const glyph of glyphs) {
      for (const hole of glyph.holes) {
        appendPlanarTriangles(body, hole, [], face, basis, uvFor);
      }

      const bottomContour = bevelContour(glyph.contour, "inset");
      const bottomHoles = glyph.holes.map((hole) =>
        bevelContour(hole, "expand"),
      );
      appendCavityWall(
        body,
        glyph.contour,
        bottomContour,
        face,
        basis,
        uvFor,
        depth,
        "toward-center",
      );
      for (let index = 0; index < glyph.holes.length; index += 1) {
        appendCavityWall(
          body,
          glyph.holes[index],
          bottomHoles[index],
          face,
          basis,
          uvFor,
          depth,
          "outward",
        );
      }
      appendPlanarTriangles(
        engraving,
        bottomContour,
        bottomHoles,
        face,
        basis,
        uvFor,
        depth,
      );
    }

    const contours = glyphs.flatMap((glyph) => [glyph.contour, ...glyph.holes]);
    const glyphPoints = contours.flat();
    const bounds = getBounds(glyphPoints);
    const surfacePlane = face.localNormal.dot(face.center);
    metrics.push({
      bottomPlane: surfacePlane - depth,
      contourCount: contours.length,
      glyphHeight: bounds.maxY - bounds.minY,
      glyphWidth: bounds.maxX - bounds.minX,
      surfacePlane,
      value: face.value,
    });
  }

  return {
    body: createGeometry(body, "polyhedral-dice-body"),
    engraving: createGeometry(engraving, "polyhedral-dice-engraving"),
    metrics,
  };
}
