import Phaser from "phaser";

export class Bullet {
  readonly container: Phaser.GameObjects.Container;
  readonly lane: number;
  readonly velocity = new Phaser.Math.Vector2();
  readonly previousPosition = new Phaser.Math.Vector2();
  state: "flying" | "impacting" = "flying";
  impactUntil = 0;
  y: number;

  constructor(scene: Phaser.Scene, lane: number, x: number, y: number, velocity: Phaser.Math.Vector2) {
    this.lane = lane;
    this.y = y;
    this.velocity.copy(velocity);
    this.previousPosition.set(x, y);
    this.container = scene.add.container(x, y);
    this.container.rotation = velocity.angle() + Math.PI / 2;
    this.container.add(scene.add.circle(0, 0, 4, 0xfff08a));
    this.container.add(scene.add.rectangle(0, 13, 4, 24, 0xffd35a, 0.78));
  }

  beginFrame() {
    this.previousPosition.set(this.container.x, this.container.y);
  }

  impact(x: number, y: number, now: number) {
    this.state = "impacting";
    this.impactUntil = now + 55;
    this.container.setPosition(x, y);
    this.y = y;
    this.container.setAlpha(0.72);
    this.container.setScale(this.container.scaleX * 0.82);
  }

  destroy() {
    this.container.destroy();
  }
}
