export type DiceShadowConfig = {
  baseScaleX: number;
  baseScaleZ: number;
  fadeHeight: number;
  floorY: number;
  liftScaleX: number;
  liftScaleZ: number;
  maxOpacity: number;
  minVisibleOpacity: number;
  offsetStrength: number;
  opacityPower: number;
  restHeight: number;
};

export type DiceShadowInput = {
  lightOffset: readonly [number, number, number];
  position: {
    x: number;
    y: number;
    z: number;
  };
};

export type DiceShadowState = {
  opacity: number;
  position: [number, number, number];
  scale: [number, number];
  visible: boolean;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDiceShadowState(
  { lightOffset, position }: DiceShadowInput,
  config: DiceShadowConfig,
): DiceShadowState {
  const heightAboveRest = Math.max(position.y - config.restHeight, 0);
  const heightFactor = clampNumber(heightAboveRest / config.fadeHeight, 0, 1);
  const opacity = config.maxOpacity * Math.pow(1 - heightFactor, config.opacityPower);
  const safeLightHeight = Math.max(Math.abs(lightOffset[1]), 0.001);
  const offsetRatio = (heightAboveRest / safeLightHeight) * config.offsetStrength;

  return {
    opacity,
    position: [
      position.x - lightOffset[0] * offsetRatio,
      config.floorY,
      position.z - lightOffset[2] * offsetRatio,
    ],
    scale: [
      config.baseScaleX + heightFactor * config.liftScaleX,
      config.baseScaleZ + heightFactor * config.liftScaleZ,
    ],
    visible: opacity >= config.minVisibleOpacity,
  };
}
