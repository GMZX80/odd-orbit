import Phaser from "phaser";

export class ShootingStar {
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly velocity = new Phaser.Math.Vector2();
  age = 0;
  lifetime: number;
  headRadius: number;
  tailLength: number;
  tailWidth: number;
  pulsePhase: number;
  pulseSpeed: number;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(-2);
    this.lifetime = 0;
    this.headRadius = 4;
    this.tailLength = 36;
    this.tailWidth = 8;
    this.pulsePhase = 0;
    this.pulseSpeed = 6;
    this.reset();
  }

  reset() {
    this.age = 0;
    this.lifetime = Phaser.Math.FloatBetween(1.8, 4.2);
    this.headRadius = Phaser.Math.FloatBetween(3, 7);
    this.tailLength = Phaser.Math.FloatBetween(26, 70);
    this.tailWidth = Phaser.Math.FloatBetween(5, 15);
    this.pulsePhase = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.pulseSpeed = Phaser.Math.FloatBetween(5, 9);

    const spawn = Phaser.Math.Between(0, 3);
    const speed = Phaser.Math.FloatBetween(180, 420);
    let x = 0;
    let y = 0;
    let angle = 0;

    if (spawn === 0) {
      x = -36;
      y = Phaser.Math.FloatBetween(60, 360);
      angle = Phaser.Math.FloatBetween(0.12, 0.58);
    } else if (spawn === 1) {
      x = 426;
      y = Phaser.Math.FloatBetween(60, 360);
      angle = Math.PI - Phaser.Math.FloatBetween(0.12, 0.58);
    } else if (spawn === 2) {
      x = Phaser.Math.FloatBetween(20, 370);
      y = -36;
      angle = Phaser.Math.FloatBetween(0.8, 2.35);
    } else {
      x = Phaser.Math.RND.pick([-34, 424]);
      y = Phaser.Math.FloatBetween(-24, 120);
      angle = x < 0 ? Phaser.Math.FloatBetween(0.25, 0.85) : Math.PI - Phaser.Math.FloatBetween(0.25, 0.85);
    }

    this.graphics.setPosition(x, y);
    this.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.draw();
  }

  update(deltaSeconds: number) {
    this.age += deltaSeconds;
    this.graphics.x += this.velocity.x * deltaSeconds;
    this.graphics.y += this.velocity.y * deltaSeconds;
    this.draw();

    return this.age <= this.lifetime && this.graphics.x > -120 && this.graphics.x < 510 && this.graphics.y < 820;
  }

  destroy() {
    this.graphics.destroy();
  }

  private draw() {
    const speed = Math.max(1, this.velocity.length());
    const dx = this.velocity.x / speed;
    const dy = this.velocity.y / speed;
    const backX = -dx;
    const backY = -dy;
    const sideX = -dy;
    const sideY = dx;
    const pulse = 0.5 + 0.5 * Math.sin(this.age * this.pulseSpeed + this.pulsePhase);
    const currentTailLength = this.tailLength * (0.75 + pulse * 0.35);
    const currentTailWidth = this.tailWidth * (0.8 + pulse * 0.3);
    const alpha = 0.72 * (0.65 + pulse * 0.35);

    const frontX = -dx * this.headRadius * 0.4;
    const frontY = -dy * this.headRadius * 0.4;
    const rearX = backX * currentTailLength;
    const rearY = backY * currentTailLength;
    const leftX = rearX + sideX * currentTailWidth;
    const leftY = rearY + sideY * currentTailWidth;
    const rightX = rearX - sideX * currentTailWidth;
    const rightY = rearY - sideY * currentTailWidth;

    this.graphics.clear();
    this.graphics.fillStyle(0x7ee4ff, alpha * 0.42);
    this.graphics.fillTriangle(frontX, frontY, leftX, leftY, rightX, rightY);
    this.graphics.fillStyle(0xe9fbff, 0.86);
    this.graphics.fillCircle(0, 0, this.headRadius);
    this.graphics.fillStyle(0xffffff, 0.72);
    this.graphics.fillCircle(-dx * this.headRadius * 0.28, -dy * this.headRadius * 0.28, this.headRadius * 0.38);
  }
}
