import type { FactionId } from "./galaxyTypes";

export interface RouteEnemyTheme {
  fill: number;
  stroke: number;
  glow: number;
  dark: number;
  core: number;
  flash: number;
  shard: number;
}

export interface FactionTheme {
  label: string;
  mapFill: number;
  mapStroke: number;
  routeEnemy: RouteEnemyTheme;
}

export const factionThemes: Record<FactionId, FactionTheme> = {
  player: {
    label: "You",
    mapFill: 0x38bdf8,
    mapStroke: 0xb9f4ff,
    routeEnemy: {
      fill: 0xc9d4dd,
      stroke: 0xffd27a,
      glow: 0xe8f2fb,
      dark: 0x26323d,
      core: 0x6f7e88,
      flash: 0xffe2a7,
      shard: 0x9aa8b5
    }
  },
  crimson: {
    label: "Crimson",
    mapFill: 0xff4f63,
    mapStroke: 0xffb0a4,
    routeEnemy: {
      fill: 0xff4f63,
      stroke: 0xffa0aa,
      glow: 0xff224d,
      dark: 0x4b1222,
      core: 0xa91530,
      flash: 0xffd27a,
      shard: 0xff7048
    }
  },
  amber: {
    label: "Amber",
    mapFill: 0xffbd4a,
    mapStroke: 0xffef9a,
    routeEnemy: {
      fill: 0xffb347,
      stroke: 0xffe3a3,
      glow: 0xff8a2f,
      dark: 0x4a2510,
      core: 0xc95f18,
      flash: 0xffef9a,
      shard: 0xff9f43
    }
  },
  violet: {
    label: "Violet",
    mapFill: 0x9b6dff,
    mapStroke: 0xe2ccff,
    routeEnemy: {
      fill: 0xaa66ff,
      stroke: 0xe2ccff,
      glow: 0x782cff,
      dark: 0x241047,
      core: 0x6f32c8,
      flash: 0xf1d9ff,
      shard: 0x9b6dff
    }
  },
  neutral: {
    label: "Open",
    mapFill: 0x9aa8b5,
    mapStroke: 0xf1f5f9,
    routeEnemy: {
      fill: 0xd8e2ec,
      stroke: 0xffffff,
      glow: 0x93a9b8,
      dark: 0x25313a,
      core: 0x7d929f,
      flash: 0xf7fbff,
      shard: 0xb9c7d3
    }
  }
};

export function routeEnemyThemeForFaction(faction: FactionId) {
  return factionThemes[faction].routeEnemy;
}
