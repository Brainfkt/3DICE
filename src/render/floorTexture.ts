import * as THREE from "three";

export type FloorNoiseDot = {
  x: number;
  y: number;
  value: number;
};

export type FloorNoiseInput = {
  seed: number;
  count: number;
  width: number;
  height: number;
};

export type FloorTextureInput = {
  seed: number;
  width: number;
  height: number;
  baseValue: number;
  variation: number;
  fiberStrength: number;
  speckleStrength: number;
};

export type FloorPbrData = {
  albedo: Uint8ClampedArray;
  normal: Uint8Array;
  roughness: Uint8Array;
};

export type FloorPbrTextureOptions = {
  anisotropy?: number;
  repeat?: number;
};

export type FloorPbrTextures = {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
};

type FloorSurfaceSample = {
  albedo: number;
  height: number;
  roughness: number;
};

const TAU = Math.PI * 2;
const DEFAULT_ANISOTROPY = 4;

export function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clampByte(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function hashGrid(x: number, y: number, seed: number) {
  let value =
    (seed >>> 0) ^
    Math.imul(x | 0, 0x1f123bb5) ^
    Math.imul(y | 0, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return ((value >>> 0) / 4294967295) * 2 - 1;
}

function samplePeriodicValueNoise(
  u: number,
  v: number,
  cellsX: number,
  cellsY: number,
  seed: number,
) {
  const x = u * cellsX;
  const y = v * cellsY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const blendX = smoothstep(x - x0);
  const blendY = smoothstep(y - y0);
  const sample = (sampleX: number, sampleY: number) =>
    hashGrid(
      positiveModulo(sampleX, cellsX),
      positiveModulo(sampleY, cellsY),
      seed,
    );
  const top = THREE.MathUtils.lerp(
    sample(x0, y0),
    sample(x0 + 1, y0),
    blendX,
  );
  const bottom = THREE.MathUtils.lerp(
    sample(x0, y0 + 1),
    sample(x0 + 1, y0 + 1),
    blendX,
  );

  return THREE.MathUtils.lerp(top, bottom, blendY);
}

function getTextureDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2
  ) {
    throw new RangeError(
      "Floor texture dimensions must be integers greater than one",
    );
  }

  return { height, width };
}

function createFloorSurfaceSampler(input: FloorTextureInput) {
  const random = createSeededRandom(input.seed);
  const phases = Array.from({ length: 6 }, () => random() * TAU);

  return (u: number, v: number): FloorSurfaceSample => {
    const broadNoise =
      samplePeriodicValueNoise(u, v, 4, 4, input.seed ^ 0x71ac) * 0.62 +
      samplePeriodicValueNoise(u, v, 8, 8, input.seed ^ 0x19e3) * 0.38;
    const midNoise = samplePeriodicValueNoise(
      u,
      v,
      16,
      16,
      input.seed ^ 0x63d7,
    );
    const fineNoise = samplePeriodicValueNoise(
      u,
      v,
      32,
      32,
      input.seed ^ 0xa2f7,
    );
    const microNoise = samplePeriodicValueNoise(
      u,
      v,
      64,
      64,
      input.seed ^ 0xc8b1,
    );
    const speckleNoise = samplePeriodicValueNoise(
      u,
      v,
      48,
      48,
      input.seed ^ 0x4d91,
    );
    const fiberWarp =
      Math.sin(TAU * (2 * v) + phases[0]) * 0.28 +
      Math.sin(TAU * (3 * u - 2 * v) + phases[1]) * 0.12;
    const longFiber = Math.sin(
      TAU * (34 * u + 3 * v) + phases[2] + fiberWarp,
    );
    const crossFiber = Math.sin(
      TAU * (5 * u - 29 * v) +
        phases[3] +
        Math.sin(TAU * (2 * u + v) + phases[4]) * 0.22,
    );
    const fineFiber = Math.sin(
      TAU * (21 * u + 17 * v) + phases[5],
    );
    const darkSpeckle = Math.max((-speckleNoise - 0.72) / 0.28, 0);
    const lightSpeckle = Math.max((speckleNoise - 0.84) / 0.16, 0);
    const speckle = -darkSpeckle + lightSpeckle * 0.38;
    const fiber =
      (longFiber * 0.52 + crossFiber * 0.3 + fineFiber * 0.18) *
      (0.24 + Math.abs(midNoise) * 0.56);

    return {
      albedo:
        broadNoise * input.variation * 0.5 +
        midNoise * input.variation * 0.2 +
        fineNoise * input.variation * 0.12 +
        fiber * input.fiberStrength * 0.08 +
        speckle * input.speckleStrength * 0.58,
      height:
        broadNoise * 0.08 +
        midNoise * 0.34 +
        fineNoise * 0.28 +
        microNoise * 0.2 +
        fiber * 0.06 +
        speckle * 0.04,
      roughness:
        broadNoise * input.variation * 0.34 -
        Math.abs(fiber) * input.fiberStrength * 0.1 +
        midNoise * 2 +
        fineNoise * 2.2 +
        microNoise * 0.8 +
        speckle * input.speckleStrength * 0.22,
    };
  };
}

function createFloorAlbedoData(
  input: FloorTextureInput,
  sampleSurface: ReturnType<typeof createFloorSurfaceSampler>,
) {
  const { height, width } = getTextureDimensions(input.width, input.height);
  const periodX = width - 1;
  const periodY = height - 1;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const v = (y % periodY) / periodY;

    for (let x = 0; x < width; x += 1) {
      const u = (x % periodX) / periodX;
      const offset = (y * width + x) * 4;
      const value = clampByte(input.baseValue + sampleSurface(u, v).albedo);

      data[offset] = value;
      data[offset + 1] = clampByte(value + 1);
      data[offset + 2] = clampByte(value - 2);
      data[offset + 3] = 255;
    }
  }

  return data;
}

function createNormalData(
  heightData: Float32Array,
  width: number,
  height: number,
  strength: number,
) {
  const periodX = width - 1;
  const periodY = height - 1;
  const data = new Uint8Array(width * height * 4);
  const getHeight = (x: number, y: number) =>
    heightData[
      positiveModulo(y, periodY) * width + positiveModulo(x, periodX)
    ];

  for (let y = 0; y < height; y += 1) {
    const sourceY = y % periodY;

    for (let x = 0; x < width; x += 1) {
      const sourceX = x % periodX;
      const gradientX =
        (getHeight(sourceX + 1, sourceY) -
          getHeight(sourceX - 1, sourceY)) *
        strength;
      const gradientY =
        (getHeight(sourceX, sourceY + 1) -
          getHeight(sourceX, sourceY - 1)) *
        strength;
      const inverseLength =
        1 / Math.sqrt(gradientX * gradientX + gradientY * gradientY + 1);
      const offset = (y * width + x) * 4;

      data[offset] = clampByte((-gradientX * inverseLength * 0.5 + 0.5) * 255);
      data[offset + 1] = clampByte(
        (-gradientY * inverseLength * 0.5 + 0.5) * 255,
      );
      data[offset + 2] = clampByte((inverseLength * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }

  return data;
}

function createFloorDataTexture(
  data: Uint8Array | Uint8ClampedArray,
  input: FloorTextureInput,
  colorSpace: THREE.ColorSpace,
  name: string,
  options: FloorPbrTextureOptions,
) {
  const texture = new THREE.DataTexture(
    data,
    input.width,
    input.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  const repeat = options.repeat ?? 1;

  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = colorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(
    Math.floor(options.anisotropy ?? DEFAULT_ANISOTROPY),
    1,
  );
  texture.needsUpdate = true;

  return texture;
}

export function createFloorNoiseDots({
  seed,
  count,
  width,
  height,
}: FloorNoiseInput): FloorNoiseDot[] {
  const random = createSeededRandom(seed);
  const dots: FloorNoiseDot[] = [];

  for (let i = 0; i < count; i += 1) {
    dots.push({
      value: 34 + Math.floor(random() * 34),
      x: random() * width,
      y: random() * height,
    });
  }

  return dots;
}

export function createFloorPbrData(input: FloorTextureInput): FloorPbrData {
  const { height, width } = getTextureDimensions(input.width, input.height);
  const periodX = width - 1;
  const periodY = height - 1;
  const sampleSurface = createFloorSurfaceSampler(input);
  const albedo = new Uint8ClampedArray(width * height * 4);
  const roughness = new Uint8Array(width * height * 4);
  const heightData = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const v = (y % periodY) / periodY;

    for (let x = 0; x < width; x += 1) {
      const u = (x % periodX) / periodX;
      const pixelIndex = y * width + x;
      const offset = pixelIndex * 4;
      const surface = sampleSurface(u, v);
      const albedoValue = clampByte(input.baseValue + surface.albedo);
      const roughnessValue = clampByte(234 + surface.roughness);

      albedo[offset] = albedoValue;
      albedo[offset + 1] = clampByte(albedoValue + 1);
      albedo[offset + 2] = clampByte(albedoValue - 2);
      albedo[offset + 3] = 255;
      roughness[offset] = roughnessValue;
      roughness[offset + 1] = roughnessValue;
      roughness[offset + 2] = roughnessValue;
      roughness[offset + 3] = 255;
      heightData[pixelIndex] = surface.height;
    }
  }

  return {
    albedo,
    normal: createNormalData(heightData, width, height, 1.1),
    roughness,
  };
}

export function createFloorTextureData(input: FloorTextureInput) {
  return createFloorAlbedoData(input, createFloorSurfaceSampler(input));
}

export function createFloorPbrTextures(
  input: FloorTextureInput,
  options: FloorPbrTextureOptions = {},
): FloorPbrTextures {
  const data = createFloorPbrData(input);

  return {
    map: createFloorDataTexture(
      data.albedo,
      input,
      THREE.SRGBColorSpace,
      "3dice-floor-albedo",
      options,
    ),
    normalMap: createFloorDataTexture(
      data.normal,
      input,
      THREE.NoColorSpace,
      "3dice-floor-normal",
      options,
    ),
    roughnessMap: createFloorDataTexture(
      data.roughness,
      input,
      THREE.NoColorSpace,
      "3dice-floor-roughness",
      options,
    ),
  };
}
