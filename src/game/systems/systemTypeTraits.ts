import type { StarSystem } from "./galaxyTypes";

export type SystemType = NonNullable<StarSystem["systemType"]>;

export interface SystemTypeTrait {
  productionBonus: number;
  defenceModifier: number;
  attackBonus: number;
  strategicValue: number;
  visualRole: "simple" | "production" | "defence" | "command" | "mobility";
}

export const systemTypeTraits: Record<SystemType, SystemTypeTrait> = {
  frontier: {
    productionBonus: 0,
    defenceModifier: 0.9,
    attackBonus: 0,
    strategicValue: 0.3,
    visualRole: "simple"
  },
  mining: {
    productionBonus: 1,
    defenceModifier: 1,
    attackBonus: 0,
    strategicValue: 0.72,
    visualRole: "production"
  },
  fortress: {
    productionBonus: 0,
    defenceModifier: 1.3,
    attackBonus: 0,
    strategicValue: 1,
    visualRole: "defence"
  },
  core: {
    productionBonus: 1,
    defenceModifier: 1.15,
    attackBonus: 0.03,
    strategicValue: 0.9,
    visualRole: "command"
  },
  rift: {
    productionBonus: 0,
    defenceModifier: 1.05,
    attackBonus: 0.05,
    strategicValue: 0.48,
    visualRole: "mobility"
  }
};

export function getSystemTypeTraits(system: StarSystem) {
  return systemTypeTraits[system.systemType ?? "frontier"];
}
