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
    far: number;
    intensity: number;
    mapSize: number;
    near: number;
    normalBias: number;
    radius: number;
  };
};

export function getShadowCastingSources(sources: readonly LightSourceConfig[]) {
  return sources.filter((source) => source.castShadow);
}

export function setLightPosition<T extends { set: (x: number, y: number, z: number) => unknown }>(
  target: { x: number; y: number; z: number },
  source: LightSourceConfig,
  output: T,
) {
  output.set(
    target.x + source.offset[0],
    source.offset[1],
    target.z + source.offset[2],
  );

  return output;
}
