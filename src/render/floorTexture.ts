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

export function createFloorTextureData({
  seed,
  width,
  height,
  baseValue,
  variation,
  fiberStrength,
  speckleStrength,
}: FloorTextureInput) {
  const random = createSeededRandom(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  const seedPhase = (seed % 4093) * 0.001;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const longFiber =
        Math.sin(x * 0.16 + Math.sin(y * 0.055) * 1.8 + seedPhase) * 0.62 +
        Math.sin((x + y * 0.32) * 0.045 + seedPhase * 2.7) * 0.38;
      const crossFiber = Math.sin(y * 0.21 + seedPhase * 4.1) * 0.28;
      const fineNoise = random() - 0.5;
      const speckleRoll = random();
      const speckle =
        speckleRoll > 0.992
          ? -speckleStrength * random()
          : speckleRoll < 0.012
            ? speckleStrength * 0.45 * random()
            : 0;
      const value = clampByte(
        baseValue +
          longFiber * fiberStrength +
          crossFiber * variation +
          fineNoise * variation +
          speckle,
      );

      data[i] = value;
      data[i + 1] = clampByte(value + 1);
      data[i + 2] = clampByte(value - 2);
      data[i + 3] = 255;
    }
  }

  return data;
}
