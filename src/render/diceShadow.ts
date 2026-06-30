export type DiceShadowConfig = {
  baseBlurPx: number;
  basePadding: number;
  fadeHeight: number;
  floorY: number;
  halfSize: number;
  liftBlurPx: number;
  liftPadding: number;
  maxOpacity: number;
  minVisibleOpacity: number;
  opacityPower: number;
  restHeight: number;
};

export type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

export type QuaternionLike = {
  w: number;
  x: number;
  y: number;
  z: number;
};

export type DiceShadowInput = {
  lightOffset: readonly [number, number, number];
  position: Vec3Like;
  quaternion: QuaternionLike;
};

export type DiceShadowState = {
  blurPx: number;
  opacity: number;
  points: Array<[number, number]>;
  position: [number, number, number];
  size: [number, number];
  visible: boolean;
};

type Vec2 = {
  x: number;
  z: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeVector(vector: Vec3Like) {
  const length = Math.hypot(vector.x, vector.y, vector.z);

  if (length <= 0.000001) {
    return { x: 0, y: -1, z: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function rotateVectorByQuaternion(vector: Vec3Like, quaternion: QuaternionLike): Vec3Like {
  const tx = 2 * (quaternion.y * vector.z - quaternion.z * vector.y);
  const ty = 2 * (quaternion.z * vector.x - quaternion.x * vector.z);
  const tz = 2 * (quaternion.x * vector.y - quaternion.y * vector.x);

  return {
    x: vector.x + quaternion.w * tx + quaternion.y * tz - quaternion.z * ty,
    y: vector.y + quaternion.w * ty + quaternion.z * tx - quaternion.x * tz,
    z: vector.z + quaternion.w * tz + quaternion.x * ty - quaternion.y * tx,
  };
}

function getCubeCorners(halfSize: number) {
  const corners: Vec3Like[] = [];

  for (const x of [-halfSize, halfSize]) {
    for (const y of [-halfSize, halfSize]) {
      for (const z of [-halfSize, halfSize]) {
        corners.push({ x, y, z });
      }
    }
  }

  return corners;
}

function projectPointToFloor(point: Vec3Like, lightDirection: Vec3Like, floorY: number): Vec2 {
  if (Math.abs(lightDirection.y) <= 0.000001) {
    return { x: point.x, z: point.z };
  }

  const t = (floorY - point.y) / lightDirection.y;

  return {
    x: point.x + lightDirection.x * t,
    z: point.z + lightDirection.z * t,
  };
}

function cross(origin: Vec2, a: Vec2, b: Vec2) {
  return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
}

function getConvexHull(points: Vec2[]) {
  const sorted = [...points]
    .sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x))
    .filter((point, index, items) => {
      const previous = items[index - 1];
      return !previous || previous.x !== point.x || previous.z !== point.z;
    });

  if (sorted.length <= 3) {
    return sorted;
  }

  const lower: Vec2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Vec2[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function getProjectedDiceShadowState(
  { lightOffset, position, quaternion }: DiceShadowInput,
  config: DiceShadowConfig,
): DiceShadowState {
  const lightDirection = normalizeVector({
    x: -lightOffset[0],
    y: -Math.abs(lightOffset[1]),
    z: -lightOffset[2],
  });
  const projectedPoints = getCubeCorners(config.halfSize).map((corner) => {
    const rotated = rotateVectorByQuaternion(corner, quaternion);
    const worldPoint = {
      x: position.x + rotated.x,
      y: position.y + rotated.y,
      z: position.z + rotated.z,
    };

    return projectPointToFloor(worldPoint, lightDirection, config.floorY);
  });
  const hull = getConvexHull(projectedPoints);
  const heightAboveRest = Math.max(position.y - config.restHeight, 0);
  const heightFactor = clampNumber(heightAboveRest / config.fadeHeight, 0, 1);
  const opacity = config.maxOpacity * Math.pow(1 - heightFactor, config.opacityPower);
  const padding = config.basePadding + heightFactor * config.liftPadding;
  const blurPx = config.baseBlurPx + heightFactor * config.liftBlurPx;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const point of hull) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const sizeX = Math.max(maxX - minX + padding * 2, 0.001);
  const sizeZ = Math.max(maxZ - minZ + padding * 2, 0.001);

  return {
    blurPx,
    opacity,
    points: hull.map((point) => [
      0.5 + (point.x - centerX) / sizeX,
      0.5 + (point.z - centerZ) / sizeZ,
    ]),
    position: [centerX, config.floorY, centerZ],
    size: [sizeX, sizeZ],
    visible: opacity >= config.minVisibleOpacity && hull.length >= 3,
  };
}
