import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createIvoryPbrData,
  createIvoryPbrTextures,
  createIvoryRoughnessData,
  createIvoryRoughnessTexture,
} from "./ivoryTexture";

const IVORY_INPUT = {
  seed: 0x1c0ffee,
  size: 128,
  baseValue: 218,
  variation: 24,
};

function getChannelRange(data: Uint8Array, channel: number) {
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

function expectTileSeamsToMatch(
  data: Uint8Array,
  width: number,
  height: number,
) {
  for (let y = 0; y < height; y += 1) {
    const left = (y * width) * 4;
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
  expect(texture.repeat.toArray()).toEqual([2, 2]);
  expect(texture.colorSpace).toBe(colorSpace);
  expect(texture.magFilter).toBe(THREE.LinearFilter);
  expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(texture.generateMipmaps).toBe(true);
  expect(texture.anisotropy).toBe(4);
  expect(texture.version).toBeGreaterThan(0);
}

describe("createIvoryRoughnessData", () => {
  it("preserves deterministic legacy roughness data", () => {
    const input = { ...IVORY_INPUT, size: 16 };

    expect(createIvoryRoughnessData(input)).toEqual(
      createIvoryRoughnessData(input),
    );
    expect(createIvoryRoughnessData({ ...input, seed: 1 })).not.toEqual(
      createIvoryRoughnessData({ ...input, seed: 2 }),
    );
  });

  it("keeps roughness pixels grayscale, bounded and opaque", () => {
    const data = createIvoryRoughnessData({ ...IVORY_INPUT, size: 32 });

    expect(data).toHaveLength(32 * 32 * 4);

    for (let index = 0; index < data.length; index += 4) {
      expect(data[index]).toBeGreaterThanOrEqual(0);
      expect(data[index]).toBeLessThanOrEqual(255);
      expect(data[index + 1]).toBe(data[index]);
      expect(data[index + 2]).toBe(data[index]);
      expect(data[index + 3]).toBe(255);
    }
  });
});

describe("ivory PBR texture set", () => {
  it("creates deterministic, seed-sensitive 128px maps", () => {
    const first = createIvoryPbrData(IVORY_INPUT);
    const second = createIvoryPbrData(IVORY_INPUT);
    const otherSeed = createIvoryPbrData({ ...IVORY_INPUT, seed: 7 });

    expect(first).toEqual(second);
    expect(first.albedo).not.toEqual(otherSeed.albedo);
    expect(first.roughness).not.toEqual(otherSeed.roughness);
    expect(first.normal).not.toEqual(otherSeed.normal);

    for (const map of Object.values(first)) {
      expect(map).toHaveLength(128 * 128 * 4);
    }
  });

  it("is exactly tileable on both axes", () => {
    const maps = createIvoryPbrData(IVORY_INPUT);

    expectTileSeamsToMatch(maps.albedo, 128, 128);
    expectTileSeamsToMatch(maps.roughness, 128, 128);
    expectTileSeamsToMatch(maps.normal, 128, 128);
  });

  it("keeps ivory color and roughness variations subtle", () => {
    const { albedo, roughness } = createIvoryPbrData(IVORY_INPUT);
    const red = getChannelRange(albedo, 0);
    const green = getChannelRange(albedo, 1);
    const blue = getChannelRange(albedo, 2);
    const roughnessRange = getChannelRange(roughness, 1);

    expect(red.min).toBeGreaterThanOrEqual(235);
    expect(red.max).toBeLessThanOrEqual(243);
    expect(red.max - red.min).toBeGreaterThanOrEqual(2);
    expect(green.average).toBeLessThan(red.average);
    expect(blue.average).toBeLessThan(green.average);
    expect(roughnessRange.min).toBeGreaterThanOrEqual(200);
    expect(roughnessRange.max).toBeLessThanOrEqual(236);
    expect(roughnessRange.max - roughnessRange.min).toBeGreaterThanOrEqual(8);
  });

  it("encodes normalized tangent-space normals with a positive blue axis", () => {
    const { normal } = createIvoryPbrData(IVORY_INPUT);
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

    expect(minBlue).toBeGreaterThan(190);
  });

  it("configures albedo in sRGB and data maps in linear color space with mipmaps", () => {
    const textures = createIvoryPbrTextures(IVORY_INPUT);
    const legacyRoughness = createIvoryRoughnessTexture(IVORY_INPUT);

    expectPbrTextureSettings(textures.map, THREE.SRGBColorSpace);
    expectPbrTextureSettings(textures.roughnessMap, THREE.NoColorSpace);
    expectPbrTextureSettings(textures.normalMap, THREE.NoColorSpace);
    expectPbrTextureSettings(legacyRoughness, THREE.NoColorSpace);

    for (const texture of [
      textures.map,
      textures.roughnessMap,
      textures.normalMap,
      legacyRoughness,
    ]) {
      expect(texture.image.width).toBe(128);
      expect(texture.image.height).toBe(128);
      texture.dispose();
    }
  });
});
