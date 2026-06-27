import { describe, expect, it } from "vitest";
import {
  defaultPhysicsProfileId,
  physicsConfig,
  physicsProfileIds,
  physicsProfileOptions,
  physicsProfiles,
} from "./config";

describe("physicsProfiles", () => {
  it("keeps the default physicsConfig mapped to the selected profile", () => {
    expect(physicsConfig).toBe(physicsProfiles[defaultPhysicsProfileId]);
  });

  it("uses the selected K profile as the product default", () => {
    expect(defaultPhysicsProfileId).toBe("k");
    expect(physicsConfig).toBe(physicsProfiles.k);
  });

  it("offers compact unique labels for direct UI comparison", () => {
    const labels = physicsProfileOptions.map((profile) => profile.label);

    expect(physicsProfileOptions).toHaveLength(12);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("does not alter drag settings between drop presets", () => {
    const baseDrag = physicsProfiles.base.drag;

    for (const id of physicsProfileIds) {
      expect(physicsProfiles[id].drag).toBe(baseDrag);
    }
  });

  it("keeps every alternative lighter and under stronger gravity than the baseline", () => {
    for (const id of physicsProfileIds.filter((profileId) => profileId !== "base")) {
      expect(physicsProfiles[id].gravity[1]).toBeLessThan(physicsProfiles.base.gravity[1]);
      expect(physicsProfiles[id].dice.mass).toBeLessThan(physicsProfiles.base.dice.mass);
    }
  });

  it("keeps anti-float variants close to the preferred B/F/G families", () => {
    expect(physicsProfiles.i.gravity[1]).toBeLessThan(physicsProfiles.b.gravity[1]);
    expect(physicsProfiles.j.gravity[1]).toBeLessThan(physicsProfiles.f.gravity[1]);
    expect(physicsProfiles.k.gravity[1]).toBeLessThan(physicsProfiles.g.gravity[1]);
    expect(physicsProfiles.i.dice.mass).toBe(physicsProfiles.b.dice.mass);
    expect(physicsProfiles.j.dice.mass).toBe(physicsProfiles.f.dice.mass);
    expect(physicsProfiles.k.dice.mass).toBe(physicsProfiles.g.dice.mass);
  });
});
