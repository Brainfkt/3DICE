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
