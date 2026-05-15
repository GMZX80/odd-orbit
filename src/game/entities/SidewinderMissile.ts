import Phaser from "phaser";
export interface SidewinderTarget {
  container: Phaser.GameObjects.Container;
}

export class SidewinderMissile {
  readonly container: Phaser.GameObjects.Container;
  readonly velocity: Phaser.Math.Vector2;
  readonly target: SidewinderTarget;
  readonly expiresAt: number;
  readonly hitRadius = 13;

  private readonly speed: number;
  private readonly turnStrength: number;
  private readonly trail: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, target: SidewinderTarget, nowMs: number) {
    this.target = target;
    this.speed = Phaser.Math.FloatBetween(560, 650);
    this.turnStrength = Phaser.Math.FloatBetween(0.055, 0.09);
    this.expiresAt = nowMs + Phaser.Math.Between(2800, 3800);
    this.velocity = new Phaser.Math.Vector2(Phaser.Math.FloatBetween(-70, 70), -this.speed);
    this.container = scene.add.container(x, y);
    this.trail = scene.add.graphics();

    const glow = scene.add.circle(0, 0, 7, 0x5ee8ff, 0.22);
    const body = scene.add.triangle(0, -2, 0, -10, -5, 7, 5, 7, 0xbffcff, 0.96);
    const core = scene.add.circle(0, -2, 2.5, 0xffffff, 0.9);
    const flame = scene.add.triangle(0, 10, -4, 4, 4, 4, 0, 16, 0x66f2a8, 0.72);

    this.container.add([this.trail, glow, flame, body, core]);
    this.container.rotation = this.velocity.angle() + Math.PI / 2;
  }

  update(timeMs: number, deltaSeconds: number) {
    if (timeMs >= this.expiresAt) {
      return false;
    }

    if (this.target.container.active) {
      const desired = new Phaser.Math.Vector2(this.target.container.x - this.container.x, this.target.container.y - this.container.y)
        .normalize()
        .scale(this.speed);
      this.velocity.x = Phaser.Math.Linear(this.velocity.x, desired.x, this.turnStrength);
      this.velocity.y = Phaser.Math.Linear(this.velocity.y, desired.y, this.turnStrength);
      this.velocity.normalize().scale(this.speed);
    }

    this.container.x += this.velocity.x * deltaSeconds;
    this.container.y += this.velocity.y * deltaSeconds;
    this.container.rotation = this.velocity.angle() + Math.PI / 2 + Math.sin(timeMs * 0.018) * 0.12;
    this.drawTrail(timeMs);

    return this.container.y > -120 && this.container.y < 780 && this.container.x > -120 && this.container.x < 510;
  }

  destroy() {
    this.container.destroy();
  }

  private drawTrail(timeMs: number) {
    const wobble = Math.sin(timeMs * 0.026) * 3;
    this.trail.clear();
    this.trail.lineStyle(3, 0x66f2a8, 0.42);
    this.trail.beginPath();
    this.trail.moveTo(0, 8);
    this.trail.lineTo(wobble, 30);
    this.trail.strokePath();
    this.trail.lineStyle(1.5, 0xbffcff, 0.68);
    this.trail.beginPath();
    this.trail.moveTo(0, 5);
    this.trail.lineTo(-wobble * 0.45, 20);
    this.trail.strokePath();
  }
}
