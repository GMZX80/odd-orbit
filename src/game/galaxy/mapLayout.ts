import type { StarSystem } from "../systems/galaxyTypes";

export const mapLeftX = 78;
export const mapScaleX = 0.84;
export const mapTopY = -52;
export const mapScaleY = 1.085;

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
