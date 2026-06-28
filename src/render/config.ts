export const renderConfig = {
  canvas: {
    dprRange: [1, 1.75] as [number, number],
  },
  shadows: {
    softSize: 16,
    softSamples: 12,
    softFocus: 0.36,
    mapSize: 2048,
    bias: -0.0001,
    normalBias: 0.018,
  },
  floorTexture: {
    size: 192,
    seed: 0x3d1ce,
    baseValue: 39,
    variation: 8,
    fiberStrength: 7,
    speckleStrength: 16,
    repeat: 680,
  },
  ivoryTexture: {
    size: 64,
    seed: 0x1c0ffee,
    baseValue: 218,
    variation: 24,
  },
  lighting: {
    toneMappingExposure: 1.03,
    ambientIntensity: 0.45,
    rimPointIntensity: 0.32,
    environmentIntensity: 0.46,
  },
  palette: {
    background: "#151614",
    fog: "#151614",
    floor: "#232521",
    contactShadow: "#070706",
  },
  performance: {
    sampleDurationMs: 5000,
    maxStoredSamples: 20,
    budgets: {
      desktopDpr1FrameMs: 16.7,
      desktopDpr2FrameMs: 24,
      mobileFrameMs: 33,
      jsGzipKb: 1100,
    },
  },
};
