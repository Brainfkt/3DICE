export type LightSourceKind = "spot" | "point";

export type LightSourceConfig = {
  angle?: number;
  castShadow: boolean;
  color: string;
  decay?: number;
  distance?: number;
  id: string;
  intensity: number;
  kind: LightSourceKind;
  offset: [number, number, number];
  penumbra?: number;
  shadow?: {
    bias: number;
    mapSize: number;
    near: number;
    normalBias: number;
  };
};

export function getShadowCastingSources(sources: readonly LightSourceConfig[]) {
  return sources.filter((source) => source.castShadow);
}

export function getLightPosition(
  target: { x: number; y: number; z: number },
  source: LightSourceConfig,
) {
  return [
    target.x + source.offset[0],
    target.y + source.offset[1],
    target.z + source.offset[2],
  ] as [number, number, number];
}
