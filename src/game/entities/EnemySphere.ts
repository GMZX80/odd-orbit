import Phaser from "phaser";
import { routeEnemyThemeForFaction, type RouteEnemyTheme } from "../systems/factionTheme";

export class EnemySphere {
  readonly container: Phaser.GameObjects.Container;
  lane: number;
  y: number;
  xOffset: number;
  speed: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  seed: number;
  radius: number;
  burstVelocityX = 0;
  burstVelocityY = 0;
  burstTimeRemaining = 0;
  burstDuration = 0;
  health = 1;

  constructor(
    scene: Phaser.Scene,
    lane: number,
    y: number,
    xOffset: number,
    speed: number,
    radius: number,
    seed: number,
    theme: RouteEnemyTheme = routeEnemyThemeForFaction("crimson")
  ) {
    this.lane = lane;
    this.y = y;
    this.xOffset = xOffset;
    this.speed = speed;
    this.radius = radius;
    this.seed = seed;
    this.wobbleSpeed = Phaser.Math.FloatBetween(1.1, 2.2);
    this.wobbleAmount = Phaser.Math.FloatBetween(1, 5);
    this.container = scene.add.container(0, y);
    const body = scene.add.circle(0, 0, radius, theme.fill, 0.96);
    body.setStrokeStyle(1.4, theme.stroke, 0.92);
    const glow = scene.add.circle(0, 0, radius * 1.38, theme.glow, 0.16);
    const glint = scene.add.circle(-radius * 0.35, -radius * 0.35, Math.max(1.4, radius * 0.22), 0xffffff, 0.72);
    this.container.add([glow, body, glint]);
  }

  configureBurst(velocityX: number, velocityY: number, durationSeconds: number) {
    this.burstVelocityX = velocityX;
    this.burstVelocityY = velocityY;
    this.burstDuration = durationSeconds;
    this.burstTimeRemaining = durationSeconds;
  }

  destroy() {
    this.container.destroy();
  }
}
