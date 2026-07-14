export type SpaceThrowKeyAction = "consume" | "ignore" | "throw";

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
