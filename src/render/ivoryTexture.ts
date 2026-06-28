import * as THREE from "three";

export type IvoryRoughnessInput = {
  seed: number;
  size: number;
  baseValue: number;
  variation: number;
};

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

export function createIvoryRoughnessData({
  seed,
  size,
  baseValue,
  variation,
}: IvoryRoughnessInput) {
  const random = createSeededRandom(seed);
  const data = new Uint8Array(size * size * 4);
  const waveSeed = (seed % 997) * 0.001;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const broadGrain =
        Math.sin(x * 0.23 + waveSeed) * 0.55 +
        Math.sin((x + y) * 0.11 + waveSeed * 3.7) * 0.45;
      const fineGrain = random() - 0.5;
      const value = clampByte(baseValue + broadGrain * variation * 0.4 + fineGrain * variation);

      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }

  return data;
}

export function createIvoryRoughnessTexture(input: IvoryRoughnessInput) {
  const texture = new THREE.DataTexture(
    createIvoryRoughnessData(input),
    input.size,
    input.size,
    THREE.RGBAFormat,
  );

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}
