import Phaser from "phaser";
import { EnemySphere } from "./EnemySphere";

interface EnemySwarmSpawnerOptions {
  lane: number;
  spawnY: number;
}

export class EnemySwarmSpawner {
  private readonly scene: Phaser.Scene;
  private readonly lane: number;
  private readonly spawnY: number;
  private timer = 0;
  private bandIndex = 0;

  constructor(scene: Phaser.Scene, options: EnemySwarmSpawnerOptions) {
    this.scene = scene;
    this.lane = options.lane;
    this.spawnY = options.spawnY;
  }

  reset() {
    this.timer = 0;
    this.bandIndex = 0;
  }

  update(deltaSeconds: number, progress: number, availableSlots: number) {
    this.timer -= deltaSeconds;
    const enemies: EnemySphere[] = [];

    while (this.timer <= 0 && enemies.length < availableSlots) {
      const band = this.spawnBand(progress, availableSlots - enemies.length);
      enemies.push(...band);
      this.timer += Phaser.Math.FloatBetween(0.55 - progress * 0.22, 0.88 - progress * 0.34);
    }

    return enemies;
  }

  private spawnBand(progress: number, availableSlots: number) {
    const enemies: EnemySphere[] = [];
    const rowCount = Phaser.Math.Between(2, progress > 0.55 ? 4 : 3);
    const baseColumns = Math.round(Phaser.Math.Linear(4, 7, progress));
    const spacingX = Phaser.Math.Linear(18, 14, progress);
    const spacingY = Phaser.Math.Linear(16, 12, progress);
    const baseSpeed = Phaser.Math.FloatBetween(34, 48) + progress * 38;
    const bandSeed = this.bandIndex++ * 19.37 + Phaser.Math.FloatBetween(0, 100);

    for (let row = 0; row < rowCount; row += 1) {
      const columns = baseColumns + (row % 2);
      for (let column = 0; column < columns; column += 1) {
        if (enemies.length >= availableSlots) {
          return enemies;
        }

        const centeredColumn = column - (columns - 1) / 2;
        const organicSkip = progress < 0.25 && row > 0 && Phaser.Math.FloatBetween(0, 1) < 0.18;
        if (organicSkip) {
          continue;
        }

        const xOffset = centeredColumn * spacingX + (row % 2 ? spacingX * 0.35 : 0) + Phaser.Math.FloatBetween(-5, 5);
        const y = this.spawnY - row * spacingY + Phaser.Math.FloatBetween(-4, 4);
        const radius = Phaser.Math.FloatBetween(6.2, 8.4);
        const seed = bandSeed + row * 7.31 + column * 3.17;
        enemies.push(new EnemySphere(this.scene, this.lane, y, xOffset, baseSpeed + Phaser.Math.FloatBetween(-5, 7), radius, seed));
      }
    }

    return enemies;
  }
}
