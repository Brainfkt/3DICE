export const renderConfig = {
  canvas: {
    dprRange: [1, 1.75] as [number, number],
  },
  shadows: {
    softSize: 18,
    softSamples: 12,
    softFocus: 0.42,
    mapSize: 2048,
    bias: -0.00008,
  },
  floorTexture: {
    size: 128,
    seed: 0x3d1ce,
    noiseDots: 900,
    repeat: 16,
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
