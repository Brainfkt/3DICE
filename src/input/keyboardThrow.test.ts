import { describe, expect, it } from "vitest";
import {
  getAppShortcutAction,
  getDiceSpaceThrowMode,
  getSpaceThrowKeyAction,
  getTouchThrowTapAction,
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

describe("getAppShortcutAction", () => {
  it("enables reset and fullscreen only in advanced mode", () => {
    expect(
      getAppShortcutAction({ ...input, advancedMode: true, code: "KeyR" }),
    ).toBe("reset");
    expect(
      getAppShortcutAction({ ...input, advancedMode: true, code: "KeyF" }),
    ).toBe("fullscreen");
    expect(
      getAppShortcutAction({ ...input, advancedMode: false, code: "KeyR" }),
    ).toBe("ignore");
  });

  it("does not intercept editable, repeated or handled shortcuts", () => {
    expect(
      getAppShortcutAction({
        ...input,
        advancedMode: true,
        blockedTarget: true,
        code: "KeyR",
      }),
    ).toBe("ignore");
    expect(
      getAppShortcutAction({
        ...input,
        advancedMode: true,
        code: "KeyF",
        repeat: true,
      }),
    ).toBe("ignore");
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

describe("getTouchThrowTapAction", () => {
  const tap = {
    distancePx: 4,
    durationMs: 160,
    isDiceDragging: false,
    isPrimary: true,
    pointerType: "touch",
  };

  it("launches for a short primary touch or pen tap", () => {
    expect(getTouchThrowTapAction(tap)).toBe("throw");
    expect(getTouchThrowTapAction({ ...tap, pointerType: "pen" })).toBe(
      "throw",
    );
  });

  it("ignores mouse clicks, secondary pointers and die drags", () => {
    expect(getTouchThrowTapAction({ ...tap, pointerType: "mouse" })).toBe(
      "ignore",
    );
    expect(getTouchThrowTapAction({ ...tap, isPrimary: false })).toBe("ignore");
    expect(getTouchThrowTapAction({ ...tap, isDiceDragging: true })).toBe(
      "ignore",
    );
  });

  it("ignores long presses and moved gestures", () => {
    expect(getTouchThrowTapAction({ ...tap, durationMs: 451 })).toBe("ignore");
    expect(getTouchThrowTapAction({ ...tap, distancePx: 15 })).toBe("ignore");
  });
});
