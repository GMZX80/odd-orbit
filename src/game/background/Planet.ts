import Phaser from "phaser";

interface Moon {
  body: Phaser.GameObjects.Arc;
  angle: number;
  orbitRadiusX: number;
  orbitRadiusY: number;
  orbitSpeed: number;
  direction: 1 | -1;
}

export class Planet {
  readonly container: Phaser.GameObjects.Container;
  readonly radius: number;
  private readonly moons: Moon[] = [];
  private readonly vx: number;
  private readonly vy: number;

  constructor(scene: Phaser.Scene) {
    const fromLeft = Phaser.Math.FloatBetween(0, 1) < 0.5;
    this.radius = Phaser.Math.FloatBetween(30, 86);
    this.container = scene.add.container(fromLeft ? -this.radius : 390 + this.radius, Phaser.Math.FloatBetween(36, 260));
    this.container.setDepth(-4);
    this.vx = fromLeft ? Phaser.Math.FloatBetween(8, 24) : -Phaser.Math.FloatBetween(8, 24);
    this.vy = Phaser.Math.FloatBetween(8, 24);

    const color = Phaser.Math.RND.pick([0x7659d9, 0x2eb5c7, 0xd88d4a, 0x4c78d8]);
    const planetBody = scene.add.circle(0, 0, this.radius, color, 0.42);
    const shade = scene.add.circle(this.radius * 0.24, this.radius * 0.06, this.radius * 0.88, 0x07131d, 0.16);
    const glow = scene.add.circle(0, 0, this.radius * 1.08, color, 0.12);
    this.container.add([glow, planetBody, shade]);

    if (Phaser.Math.FloatBetween(0, 1) < 0.44) {
      this.container.add(scene.add.ellipse(0, 0, this.radius * 2.5, this.radius * 0.42, 0xdbe9ff, 0.12));
    }

    const bands = Phaser.Math.Between(1, 3);
    for (let index = 0; index < bands; index += 1) {
      this.container.add(
        scene.add.ellipse(
          0,
          Phaser.Math.FloatBetween(-this.radius * 0.42, this.radius * 0.42),
          this.radius * Phaser.Math.FloatBetween(1.1, 1.7),
          this.radius * 0.08,
          0xffffff,
          0.12
        )
      );
    }

    const moonCount = Phaser.Math.FloatBetween(0, 1) < 0.5 ? (Phaser.Math.FloatBetween(0, 1) < 0.18 ? 2 : 1) : 0;
    for (let index = 0; index < moonCount; index += 1) {
      const moonRadius = this.radius * Phaser.Math.FloatBetween(0.12, 0.22);
      const moon = scene.add.circle(0, 0, moonRadius, 0xeaf4ff, 0.82);
      this.container.addAt(moon, 0);
      this.moons.push({
        body: moon,
        angle: Phaser.Math.FloatBetween(0, Math.PI * 2),
        orbitRadiusX: this.radius * Phaser.Math.FloatBetween(1.4, 2.2),
        orbitRadiusY: this.radius * Phaser.Math.FloatBetween(0.5, 1),
        orbitSpeed: Phaser.Math.FloatBetween(0.0004, 0.0014),
        direction: index % 2 === 0 ? 1 : -1
      });
    }
  }

  update(deltaSeconds: number) {
    this.container.x += this.vx * deltaSeconds;
    this.container.y += this.vy * deltaSeconds;

    for (const moon of this.moons) {
      moon.angle += moon.orbitSpeed * moon.direction * deltaSeconds * 1000;
      const behind = Math.sin(moon.angle) < 0;
      moon.body.setPosition(Math.cos(moon.angle) * moon.orbitRadiusX, Math.sin(moon.angle) * moon.orbitRadiusY);
      moon.body.setAlpha(behind ? 0.42 : 0.86);
      this.container.moveTo(moon.body, behind ? 0 : this.container.length - 1);
    }

    return this.container.x > -150 && this.container.x < 540 && this.container.y < 820;
  }

  destroy() {
    this.container.destroy();
  }
}
