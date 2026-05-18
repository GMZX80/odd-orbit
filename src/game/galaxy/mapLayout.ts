import type { StarSystem } from "../systems/galaxyTypes";

export const mapLeftX = 82;
export const mapScaleX = 0.78;
export const mapTopY = 24;
export const mapScaleY = 0.96;

export function mapX(x: number) {
  return mapLeftX + x * mapScaleX;
}

export function mapY(y: number) {
  return mapTopY + y * mapScaleY;
}

export function toVisualSystem(system: StarSystem): StarSystem {
  return {
    ...system,
    x: mapX(system.x),
    y: mapY(system.y)
  };
}
