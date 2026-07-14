import * as THREE from "three";

export type IvoryRoughnessInput = {
  seed: number;
  size: number;
  baseValue: number;
  variation: number;
};

export type IvoryPbrData = {
  albedo: Uint8Array;
  normal: Uint8Array;
  roughness: Uint8Array;
};

export type IvoryPbrTextures = {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
};

const TAU = Math.PI * 2;
const IVORY_REPEAT = 2;
const IVORY_TEXTURE_ANISOTROPY = 4;

function createSeededRandom(seed: number) {
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

function getTextureSize(size: number) {
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError("Ivory texture size must be an integer greater than one");
  }

  return size;
}

type IvorySurfaceSample = {
  albedo: number;
  height: number;
  roughness: number;
};

function createIvorySurfaceSampler(seed: number) {
  const random = createSeededRandom(seed);
  const phases = Array.from({ length: 8 }, () => random() * TAU);

  return (u: number, v: number): IvorySurfaceSample => {
    const broad =
      Math.sin(TAU * (2 * u + v) + phases[0]) * 0.34 +
      Math.sin(TAU * (u - 3 * v) + phases[1]) * 0.24 +
      Math.cos(TAU * (4 * u + 2 * v) + phases[2]) * 0.16;
    const grain =
      Math.sin(TAU * (7 * u + 5 * v) + phases[3]) * 0.34 +
      Math.sin(TAU * (13 * u - 9 * v) + phases[4]) * 0.24 +
      Math.cos(TAU * (19 * u + 17 * v) + phases[5]) * 0.14;
    const pores =
      Math.sin(TAU * (23 * u - 11 * v) + phases[6]) * 0.12 +
      Math.cos(TAU * (29 * u + 7 * v) + phases[7]) * 0.08;

    return {
      albedo: broad * 0.72 + grain * 0.22 + pores * 0.06,
      height: broad * 0.12 + grain * 0.58 + pores * 0.3,
      roughness: broad * 0.46 + grain * 0.42 + pores * 0.12,
    };
  };
}

function createIvorySurfaceFields(input: IvoryRoughnessInput) {
  const size = getTextureSize(input.size);
  const period = size - 1;
  const sampleSurface = createIvorySurfaceSampler(input.seed);
  const albedo = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    const v = (y % period) / period;

    for (let x = 0; x < size; x += 1) {
      const u = (x % period) / period;
      const index = y * size + x;
      const sample = sampleSurface(u, v);

      albedo[index] = sample.albedo;
      height[index] = sample.height;
      roughness[index] = sample.roughness;
    }
  }

  return { albedo, height, period, roughness, size };
}

function createIvoryAlbedoData(fields: ReturnType<typeof createIvorySurfaceFields>) {
  const data = new Uint8Array(fields.size * fields.size * 4);

  for (let index = 0; index < fields.albedo.length; index += 1) {
    const offset = index * 4;
    const variation = fields.albedo[index];

    data[offset] = clampByte(239 + variation * 3.2);
    data[offset + 1] = clampByte(231 + variation * 2.8);
    data[offset + 2] = clampByte(211 + variation * 2.4);
    data[offset + 3] = 255;
  }

  return data;
}

function createIvoryRoughnessDataFromFields(
  fields: ReturnType<typeof createIvorySurfaceFields>,
  input: IvoryRoughnessInput,
) {
  const data = new Uint8Array(fields.size * fields.size * 4);

  for (let index = 0; index < fields.roughness.length; index += 1) {
    const offset = index * 4;
    const value = clampByte(
      input.baseValue + fields.roughness[index] * input.variation * 0.58,
    );

    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }

  return data;
}

function createNormalData(
  height: Float32Array,
  width: number,
  heightPixels: number,
  periodX: number,
  periodY: number,
  strength: number,
) {
  const data = new Uint8Array(width * heightPixels * 4);

  const getHeight = (x: number, y: number) => {
    const wrappedX = ((x % periodX) + periodX) % periodX;
    const wrappedY = ((y % periodY) + periodY) % periodY;
    return height[wrappedY * width + wrappedX];
  };

  for (let y = 0; y < heightPixels; y += 1) {
    const sourceY = y % periodY;

    for (let x = 0; x < width; x += 1) {
      const sourceX = x % periodX;
      const gradientX =
        (getHeight(sourceX + 1, sourceY) - getHeight(sourceX - 1, sourceY)) *
        strength;
      const gradientY =
        (getHeight(sourceX, sourceY + 1) - getHeight(sourceX, sourceY - 1)) *
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

function createIvoryDataTexture(
  data: Uint8Array,
  size: number,
  colorSpace: THREE.ColorSpace,
  name: string,
) {
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );

  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(IVORY_REPEAT, IVORY_REPEAT);
  texture.colorSpace = colorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = IVORY_TEXTURE_ANISOTROPY;
  texture.needsUpdate = true;

  return texture;
}

export function createIvoryPbrData(input: IvoryRoughnessInput): IvoryPbrData {
  const fields = createIvorySurfaceFields(input);

  return {
    albedo: createIvoryAlbedoData(fields),
    normal: createNormalData(
      fields.height,
      fields.size,
      fields.size,
      fields.period,
      fields.period,
      0.72,
    ),
    roughness: createIvoryRoughnessDataFromFields(fields, input),
  };
}

export function createIvoryRoughnessData(input: IvoryRoughnessInput) {
  const fields = createIvorySurfaceFields(input);
  return createIvoryRoughnessDataFromFields(fields, input);
}

export function createIvoryPbrTextures(
  input: IvoryRoughnessInput,
): IvoryPbrTextures {
  const data = createIvoryPbrData(input);

  return {
    map: createIvoryDataTexture(
      data.albedo,
      input.size,
      THREE.SRGBColorSpace,
      "3dice-ivory-albedo",
    ),
    normalMap: createIvoryDataTexture(
      data.normal,
      input.size,
      THREE.NoColorSpace,
      "3dice-ivory-normal",
    ),
    roughnessMap: createIvoryDataTexture(
      data.roughness,
      input.size,
      THREE.NoColorSpace,
      "3dice-ivory-roughness",
    ),
  };
}

export function createIvoryRoughnessTexture(input: IvoryRoughnessInput) {
  return createIvoryDataTexture(
    createIvoryRoughnessData(input),
    input.size,
    THREE.NoColorSpace,
    "3dice-ivory-roughness",
  );
}
