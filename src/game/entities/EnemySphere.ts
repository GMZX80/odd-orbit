import Phaser from "phaser";

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
  health = 1;

  constructor(scene: Phaser.Scene, lane: number, y: number, xOffset: number, speed: number, radius: number, seed: number) {
    this.lane = lane;
    this.y = y;
    this.xOffset = xOffset;
    this.speed = speed;
    this.radius = radius;
    this.seed = seed;
    this.wobbleSpeed = Phaser.Math.FloatBetween(1.1, 2.2);
    this.wobbleAmount = Phaser.Math.FloatBetween(1, 5);
    this.container = scene.add.container(0, y);
    const body = scene.add.circle(0, 0, radius, 0xff4f63, 0.96);
    body.setStrokeStyle(1.4, 0xffa0aa, 0.92);
    const glint = scene.add.circle(-radius * 0.35, -radius * 0.35, Math.max(1.4, radius * 0.22), 0xffffff, 0.72);
    this.container.add([body, glint]);
  }

  destroy() {
    this.container.destroy();
  }
}
