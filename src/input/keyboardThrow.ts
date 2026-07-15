export type SpaceThrowKeyAction = "consume" | "ignore" | "throw";
export type DiceSpaceThrowMode = "blocked" | "reset-and-throw" | "throw";
export type TouchThrowTapAction = "ignore" | "throw";
export type AppShortcutAction = "fullscreen" | "ignore" | "reset";

export type SpaceThrowKeyInput = {
  blockedTarget: boolean;
  code: string;
  defaultPrevented: boolean;
  repeat: boolean;
};

export const SPACE_THROW_BLOCKED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable]:not([contenteditable='false'])",
].join(", ");

export function getSpaceThrowKeyAction({
  blockedTarget,
  code,
  defaultPrevented,
  repeat,
}: SpaceThrowKeyInput): SpaceThrowKeyAction {
  if (code !== "Space" || defaultPrevented || blockedTarget) return "ignore";
  return repeat ? "consume" : "throw";
}

export function getAppShortcutAction({
  advancedMode,
  blockedTarget,
  code,
  defaultPrevented,
  repeat,
}: SpaceThrowKeyInput & { advancedMode: boolean }): AppShortcutAction {
  if (!advancedMode || blockedTarget || defaultPrevented || repeat) return "ignore";
  if (code === "KeyR") return "reset";
  if (code === "KeyF") return "fullscreen";
  return "ignore";
}

export function getDiceSpaceThrowMode({
  diceCount,
  hasActiveDice,
  resetBeforeThrow = false,
}: {
  diceCount: number;
  hasActiveDice: boolean;
  resetBeforeThrow?: boolean;
}): DiceSpaceThrowMode {
  if (diceCount > 1 || resetBeforeThrow) return "reset-and-throw";
  return hasActiveDice ? "blocked" : "throw";
}

export function getTouchThrowTapAction({
  distancePx,
  durationMs,
  isDiceDragging,
  isPrimary,
  pointerType,
}: {
  distancePx: number;
  durationMs: number;
  isDiceDragging: boolean;
  isPrimary: boolean;
  pointerType: string;
}): TouchThrowTapAction {
  const isTouchLike = pointerType === "touch" || pointerType === "pen";
  if (!isTouchLike || !isPrimary || isDiceDragging) return "ignore";
  if (distancePx > 14 || durationMs > 450) return "ignore";
  return "throw";
}
