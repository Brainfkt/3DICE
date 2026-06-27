import { renderConfig } from "./config";

export type RenderDprSetting = number | [number, number];

export type RenderMetricsSnapshot = {
  averageFrameMs: number;
  bestFrameMs: number;
  drawCalls: number;
  dpr: number;
  frames: number;
  fps: number;
  lines: number;
  points: number;
  sampleMs: number;
  triangles: number;
  viewport: {
    width: number;
    height: number;
  };
  worstFrameMs: number;
};

declare global {
  interface Window {
    __3diceLastRenderMetrics?: RenderMetricsSnapshot;
    __3diceRenderMetrics?: RenderMetricsSnapshot[];
  }
}

function getParams(search: string) {
  return new URLSearchParams(search);
}

export function isRenderPerfEnabled(search = "") {
  return getParams(search).get("perf") === "1";
}

export function getRenderDprSetting(search = ""): RenderDprSetting {
  const value = Number(getParams(search).get("dpr"));

  if (value === 1 || value === 2) {
    return value;
  }

  return renderConfig.canvas.dprRange;
}

export function publishRenderMetrics(snapshot: RenderMetricsSnapshot) {
  if (typeof window === "undefined") return;

  const samples = window.__3diceRenderMetrics ?? [];
  samples.push(snapshot);

  if (samples.length > renderConfig.performance.maxStoredSamples) {
    samples.shift();
  }

  window.__3diceRenderMetrics = samples;
  window.__3diceLastRenderMetrics = snapshot;
  console.info("[3DICE perf]", snapshot);
}
