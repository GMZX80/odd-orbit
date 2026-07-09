import Phaser from "phaser";
import { routeEnemyThemeForFaction, type RouteEnemyTheme } from "../systems/factionTheme";
import { BroodCore } from "./BroodCore";

interface BroodCoreSpawnerOptions {
  lane: number;
  spawnY: number;
  theme?: RouteEnemyTheme;
}

export class BroodCoreSpawner {
  private readonly scene: Phaser.Scene;
  private readonly lane: number;
  private readonly spawnY: number;
  private readonly theme: RouteEnemyTheme;
  private nextSpawnDistance = 0;

  constructor(scene: Phaser.Scene, options: BroodCoreSpawnerOptions) {
    this.scene = scene;
    this.lane = options.lane;
    this.spawnY = options.spawnY;
    this.theme = options.theme ?? routeEnemyThemeForFaction("crimson");
    this.reset();
  }

  reset() {
    this.nextSpawnDistance = Phaser.Math.Between(760, 980);
  }

  update(distance: number, progress: number, activeCount: number) {
    if (activeCount > 0 || distance < this.nextSpawnDistance) {
      return undefined;
    }

    const broodCore = new BroodCore(this.scene, {
      lane: this.lane,
      y: this.spawnY,
      xOffset: Phaser.Math.FloatBetween(-8, 8),
      progress,
      theme: this.theme
    });

    this.nextSpawnDistance = distance + Phaser.Math.Between(1050, 1600) - Math.round(progress * 170);
    return broodCore;
  }
}
