import Phaser from "phaser";
import { Planet } from "./Planet";
import { ShootingStar } from "./ShootingStar";

interface SpaceObject {
  body: Phaser.GameObjects.Container;
  vx: number;
  vy: number;
  spin: number;
}

export class SpaceObjectSpawner {
  private readonly scene: Phaser.Scene;
  private readonly objects: SpaceObject[] = [];
  private readonly planets: Planet[] = [];
  private readonly shootingStars: ShootingStar[] = [];
  private objectTimer = 1.2;
  private planetTimer = 2.4;
  private shootingStarTimer = 0.9;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  update(deltaSeconds: number) {
    this.objectTimer -= deltaSeconds;
    this.planetTimer -= deltaSeconds;
    this.shootingStarTimer -= deltaSeconds;

    if (this.shootingStarTimer <= 0 && this.shootingStars.length < 4) {
      this.spawnShootingStar();
      this.shootingStarTimer = Phaser.Math.FloatBetween(1.8, 4.5);
    }

    if (this.planetTimer <= 0 && this.planets.length < 4) {
      this.spawnPlanet();
      this.planetTimer = Phaser.Math.FloatBetween(6, 14);
    }

    if (this.objectTimer <= 0 && this.objects.length < 8) {
      this.spawnSceneryObject();
      this.objectTimer = Phaser.Math.FloatBetween(1.8, 4.2);
    }

    this.updateShootingStars(deltaSeconds);
    this.updatePlanets(deltaSeconds);

    for (const object of this.objects) {
      object.body.x += object.vx * deltaSeconds;
      object.body.y += object.vy * deltaSeconds;
      object.body.rotation += object.spin * deltaSeconds;
    }

    for (let index = this.objects.length - 1; index >= 0; index -= 1) {
      const object = this.objects[index];
      if (object.body.x < -130 || object.body.x > 520 || object.body.y > 820) {
        object.body.destroy();
        this.objects.splice(index, 1);
      }
    }
  }

  destroy() {
    for (const object of this.objects) {
      object.body.destroy();
    }
    for (const planet of this.planets) {
      planet.destroy();
    }
    for (const shootingStar of this.shootingStars) {
      shootingStar.destroy();
    }
    this.objects.length = 0;
    this.planets.length = 0;
    this.shootingStars.length = 0;
  }

  private updateShootingStars(deltaSeconds: number) {
    for (let index = this.shootingStars.length - 1; index >= 0; index -= 1) {
      const shootingStar = this.shootingStars[index];
      if (!shootingStar.update(deltaSeconds)) {
        shootingStar.destroy();
        this.shootingStars.splice(index, 1);
      }
    }
  }

  private updatePlanets(deltaSeconds: number) {
    for (let index = this.planets.length - 1; index >= 0; index -= 1) {
      const planet = this.planets[index];
      if (!planet.update(deltaSeconds)) {
        planet.destroy();
        this.planets.splice(index, 1);
      }
    }
  }

  private spawnSceneryObject() {
    const roll = Phaser.Math.FloatBetween(0, 1);
    if (roll < 0.68) {
      this.spawnStation();
    } else {
      this.spawnDebris();
    }
  }

  private spawnPlanet() {
    this.planets.push(new Planet(this.scene));
  }

  private spawnShootingStar() {
    this.shootingStars.push(new ShootingStar(this.scene));
  }

  private spawnStation() {
    const body = this.scene.add.container(Phaser.Math.RND.pick([-58, 448]), Phaser.Math.FloatBetween(90, 260));
    body.setDepth(-3);
    body.add(this.scene.add.rectangle(0, 0, 42, 14, 0xb7c4d8, 0.42));
    body.add(this.scene.add.rectangle(0, 0, 14, 38, 0x7ee4ff, 0.32));
    body.add(this.scene.add.circle(0, 0, 8, 0xffe66f, 0.38));
    this.objects.push({ body, vx: body.x < 0 ? 34 : -34, vy: 28, spin: Phaser.Math.FloatBetween(-0.18, 0.18) });
  }

  private spawnDebris() {
    const body = this.scene.add.container(Phaser.Math.FloatBetween(10, 380), -24);
    body.setDepth(-1);
    body.add(this.scene.add.polygon(0, 0, "0 -10 12 -2 7 11 -9 8 -13 -4", 0xa58d72, 0.46));
    this.objects.push({ body, vx: Phaser.Math.FloatBetween(-22, 22), vy: Phaser.Math.FloatBetween(48, 88), spin: Phaser.Math.FloatBetween(-1.2, 1.2) });
  }
}
