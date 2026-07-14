import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createFloorNoiseDots,
  createFloorPbrData,
  createFloorPbrTextures,
  createFloorTextureData,
} from "./floorTexture";

const FLOOR_INPUT = {
  seed: 0x3d1ce,
  width: 256,
  height: 256,
  baseValue: 205,
  variation: 8,
  fiberStrength: 4,
  speckleStrength: 10,
};

function getChannelRange(
  data: Uint8Array | Uint8ClampedArray,
  channel: number,
) {
  let min = 255;
  let max = 0;
  let total = 0;
  let count = 0;

  for (let index = channel; index < data.length; index += 4) {
    min = Math.min(min, data[index]);
    max = Math.max(max, data[index]);
    total += data[index];
    count += 1;
  }

  return { average: total / count, max, min };
}

function getMaxHorizontalDelta(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
) {
  let maxDelta = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const current = (y * width + x) * 4;
      const previous = current - 4;
      maxDelta = Math.max(
        maxDelta,
        Math.abs(data[current] - data[previous]),
      );
    }
  }

  return maxDelta;
}

function expectTileSeamsToMatch(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
) {
  for (let y = 0; y < height; y += 1) {
    const left = y * width * 4;
    const right = (y * width + width - 1) * 4;
    expect(Array.from(data.slice(right, right + 4))).toEqual(
      Array.from(data.slice(left, left + 4)),
    );
  }

  for (let x = 0; x < width; x += 1) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    expect(Array.from(data.slice(bottom, bottom + 4))).toEqual(
      Array.from(data.slice(top, top + 4)),
    );
  }
}

function expectPbrTextureSettings(
  texture: THREE.DataTexture,
  colorSpace: THREE.ColorSpace,
) {
  expect(texture.wrapS).toBe(THREE.RepeatWrapping);
  expect(texture.wrapT).toBe(THREE.RepeatWrapping);
  expect(texture.repeat.toArray()).toEqual([11, 11]);
  expect(texture.colorSpace).toBe(colorSpace);
  expect(texture.magFilter).toBe(THREE.LinearFilter);
  expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(texture.generateMipmaps).toBe(true);
  expect(texture.anisotropy).toBe(8);
  expect(texture.version).toBeGreaterThan(0);
}

describe("createFloorNoiseDots", () => {
  it("creates deterministic noise from the same seed", () => {
    const input = { seed: 0x3d1ce, count: 8, width: 128, height: 128 };

    expect(createFloorNoiseDots(input)).toEqual(createFloorNoiseDots(input));
  });

  it("changes the noise pattern when the seed changes", () => {
    const input = { count: 8, width: 128, height: 128 };

    expect(createFloorNoiseDots({ ...input, seed: 1 })).not.toEqual(
      createFloorNoiseDots({ ...input, seed: 2 }),
    );
  });

  it("keeps dot values and positions within texture bounds", () => {
    const dots = createFloorNoiseDots({
      seed: 0x3d1ce,
      count: 128,
      width: 64,
      height: 32,
    });

    expect(dots).toHaveLength(128);

    for (const dot of dots) {
      expect(dot.value).toBeGreaterThanOrEqual(34);
      expect(dot.value).toBeLessThan(68);
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThan(64);
      expect(dot.y).toBeGreaterThanOrEqual(0);
      expect(dot.y).toBeLessThan(32);
    }
  });
});

describe("createFloorTextureData", () => {
  it("preserves the deterministic legacy albedo API", () => {
    const input = { ...FLOOR_INPUT, width: 32, height: 24 };

    expect(createFloorTextureData(input)).toEqual(createFloorTextureData(input));
    expect(createFloorTextureData({ ...input, seed: 1 })).not.toEqual(
      createFloorTextureData({ ...input, seed: 2 }),
    );
  });

  it("keeps pixels within byte bounds and opaque", () => {
    const data = createFloorTextureData({
      ...FLOOR_INPUT,
      width: 16,
      height: 12,
    });

    expect(data).toHaveLength(16 * 12 * 4);

    for (let index = 0; index < data.length; index += 4) {
      expect(data[index]).toBeGreaterThanOrEqual(0);
      expect(data[index]).toBeLessThanOrEqual(255);
      expect(data[index + 1]).toBeGreaterThanOrEqual(0);
      expect(data[index + 1]).toBeLessThanOrEqual(255);
      expect(data[index + 2]).toBeGreaterThanOrEqual(0);
      expect(data[index + 2]).toBeLessThanOrEqual(255);
      expect(data[index + 3]).toBe(255);
    }
  });
});

describe("floor PBR texture set", () => {
  it("creates deterministic, seed-sensitive 256px maps", () => {
    const first = createFloorPbrData(FLOOR_INPUT);
    const second = createFloorPbrData(FLOOR_INPUT);
    const otherSeed = createFloorPbrData({ ...FLOOR_INPUT, seed: 19 });

    expect(first).toEqual(second);
    expect(first.albedo).not.toEqual(otherSeed.albedo);
    expect(first.roughness).not.toEqual(otherSeed.roughness);
    expect(first.normal).not.toEqual(otherSeed.normal);

    for (const map of Object.values(first)) {
      expect(map).toHaveLength(256 * 256 * 4);
    }
  });

  it("is exactly tileable on both axes", () => {
    const maps = createFloorPbrData(FLOOR_INPUT);

    expectTileSeamsToMatch(maps.albedo, 256, 256);
    expectTileSeamsToMatch(maps.roughness, 256, 256);
    expectTileSeamsToMatch(maps.normal, 256, 256);
  });

  it("keeps the graphite albedo restrained and the surface predominantly matte", () => {
    const { albedo, roughness } = createFloorPbrData(FLOOR_INPUT);
    const albedoRange = getChannelRange(albedo, 0);
    const roughnessRange = getChannelRange(roughness, 1);

    expect(albedoRange.min).toBeGreaterThanOrEqual(185);
    expect(albedoRange.max).toBeLessThanOrEqual(218);
    expect(albedoRange.max - albedoRange.min).toBeGreaterThanOrEqual(8);
    expect(getMaxHorizontalDelta(albedo, 256, 256)).toBeLessThanOrEqual(12);
    expect(roughnessRange.min).toBeGreaterThanOrEqual(215);
    expect(roughnessRange.max).toBeLessThanOrEqual(248);
    expect(roughnessRange.average).toBeGreaterThan(228);
  });

  it("encodes normalized tangent-space fiber normals with a positive blue axis", () => {
    const { normal } = createFloorPbrData(FLOOR_INPUT);
    let minBlue = 255;

    for (let index = 0; index < normal.length; index += 4) {
      const x = (normal[index] / 255) * 2 - 1;
      const y = (normal[index + 1] / 255) * 2 - 1;
      const z = (normal[index + 2] / 255) * 2 - 1;
      const length = Math.sqrt(x * x + y * y + z * z);

      expect(length).toBeGreaterThan(0.985);
      expect(length).toBeLessThan(1.015);
      minBlue = Math.min(minBlue, normal[index + 2]);
      expect(normal[index + 3]).toBe(255);
    }

    expect(minBlue).toBeGreaterThan(170);
  });

  it("configures albedo in sRGB and data maps in linear color space with mipmaps", () => {
    const textures = createFloorPbrTextures(FLOOR_INPUT, {
      anisotropy: 8,
      repeat: 11,
    });

    expectPbrTextureSettings(textures.map, THREE.SRGBColorSpace);
    expectPbrTextureSettings(textures.roughnessMap, THREE.NoColorSpace);
    expectPbrTextureSettings(textures.normalMap, THREE.NoColorSpace);

    for (const texture of [
      textures.map,
      textures.roughnessMap,
      textures.normalMap,
    ]) {
      expect(texture.image.width).toBe(256);
      expect(texture.image.height).toBe(256);
      texture.dispose();
    }
  });
});
