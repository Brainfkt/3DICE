import { describe, expect, it } from "vitest";
import { getSpaceThrowKeyAction } from "./keyboardThrow";

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
