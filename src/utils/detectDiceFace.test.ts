import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { detectDiceFace } from "./detectDiceFace";

describe("detectDiceFace", () => {
  it("detects the initial top face", () => {
    expect(detectDiceFace(new THREE.Quaternion())).toBe(1);
  });

  it("detects the bottom face after a half turn around X", () => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
    expect(detectDiceFace(rotation)).toBe(6);
  });

  it("detects side faces from quaternion orientation", () => {
    const rightFaceUp = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    );
    const leftFaceUp = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    );

    expect(detectDiceFace(rightFaceUp)).toBe(3);
    expect(detectDiceFace(leftFaceUp)).toBe(4);
  });
});
