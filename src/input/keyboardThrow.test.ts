import { describe, expect, it } from "vitest";
import {
  getDiceSpaceThrowMode,
  getSpaceThrowKeyAction,
} from "./keyboardThrow";

const input = {
  blockedTarget: false,
  code: "Space",
  defaultPrevented: false,
  repeat: false,
};

describe("getSpaceThrowKeyAction", () => {
  it("throws once for an initial Space press", () => {
    expect(getSpaceThrowKeyAction(input)).toBe("throw");
  });

  it("consumes key repeat without launching again or scrolling", () => {
    expect(getSpaceThrowKeyAction({ ...input, repeat: true })).toBe("consume");
  });

  it("ignores other keys and already handled events", () => {
    expect(getSpaceThrowKeyAction({ ...input, code: "Enter" })).toBe("ignore");
    expect(getSpaceThrowKeyAction({ ...input, defaultPrevented: true })).toBe(
      "ignore",
    );
  });

  it("leaves interactive and editable targets untouched", () => {
    expect(getSpaceThrowKeyAction({ ...input, blockedTarget: true })).toBe(
      "ignore",
    );
  });
});

describe("getDiceSpaceThrowMode", () => {
  it("keeps the single die protected from stacked throws", () => {
    expect(
      getDiceSpaceThrowMode({ diceCount: 1, hasActiveDice: false }),
    ).toBe("throw");
    expect(
      getDiceSpaceThrowMode({ diceCount: 1, hasActiveDice: true }),
    ).toBe("blocked");
  });

  it("always resets the multi-dice group before throwing", () => {
    expect(
      getDiceSpaceThrowMode({ diceCount: 2, hasActiveDice: false }),
    ).toBe("reset-and-throw");
    expect(
      getDiceSpaceThrowMode({ diceCount: 4, hasActiveDice: true }),
    ).toBe("reset-and-throw");
  });
});
