import Phaser from "phaser";
import { ParallaxSpaceScene } from "../background/ParallaxSpaceScene";
import { Bullet } from "../entities/Bullet";
import { EnemySphere } from "../entities/EnemySphere";
import { EnemySwarmSpawner } from "../entities/EnemySwarmSpawner";
import { NumberCard } from "../entities/NumberCard";
import { PlayerSwarm } from "../entities/PlayerSwarm";
import { gameEvents } from "../events";
import { generateBalancedCard } from "../systems/cardBalancing";
import type { RunResult } from "../systems/runTypes";

interface TravelSceneData {
  idle?: boolean;
}

const laneCount = 3;
const centerLane = 1;
const cardLane = 2;
const maxVisibleEnemies = 120;
const runDistanceGoal = 1500;
const road = {
  horizonY: 82,
  bottomY: 720,
  topWidth: 118,
  bottomWidth: 488,
  centerX: 195,
  playerY: 628
};

export class TravelScene extends Phaser.Scene {
  private player?: PlayerSwarm;
  private cards: NumberCard[] = [];
  private enemies: EnemySphere[] = [];
  private bullets: Bullet[] = [];
  private enemySpawner?: EnemySwarmSpawner;
  private selectedLane = centerLane;
  private cardSpawnTimer = 1.1;
  private distance = 0;
  private idle = true;
  private ending = false;
  private distanceText?: Phaser.GameObjects.Text;
  private spaceScene?: ParallaxSpaceScene;

  constructor() {
    super("TravelScene");
  }

  create(data: TravelSceneData) {
    this.idle = Boolean(data.idle);
    this.ending = false;
    this.selectedLane = centerLane;
    this.cardSpawnTimer = 1.1;
    this.distance = 0;
    this.cards.forEach((card) => card.destroy());
    this.enemies.forEach((enemy) => enemy.destroy());
    this.bullets.forEach((bullet) => bullet.destroy());
    this.spaceScene?.destroy();
    this.cards = [];
    this.enemies = [];
    this.bullets = [];

    this.spaceScene = new ParallaxSpaceScene(this);
    this.player = new PlayerSwarm(this, this.laneCenterX(this.selectedLane, road.playerY), road.playerY);
    this.player.container.setDepth(900);
    this.enemySpawner = new EnemySwarmSpawner(this, { lane: centerLane, spawnY: road.horizonY - 12 });
    this.createInput();

    this.distanceText = this.add
      .text(195, 675, "Swipe or drag to choose a lane", {
        color: "#d7e1ea",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "800"
      })
      .setOrigin(0.5)
      .setDepth(950);

    gameEvents.emit("run:update", this.snapshot());

    if (this.idle) {
      this.player.container.setAlpha(0.72);
      this.distanceText.setText("Ready for numbers");
    }
  }

  update(_time: number, delta: number) {
    const deltaSeconds = delta / 1000;
    this.spaceScene?.update(deltaSeconds);

    if (!this.player || this.idle || this.ending) {
      this.animatePlayer(delta);
      return;
    }

    const progress = Phaser.Math.Clamp(this.distance / runDistanceGoal, 0, 1);
    this.distance += 80 * deltaSeconds;
    this.cardSpawnTimer -= deltaSeconds;

    if (this.cardSpawnTimer <= 0) {
      this.cardSpawnTimer = Phaser.Math.Linear(1.9, 1.25, progress);
      this.spawnRightCard();
    }
    const enemySlots = Math.max(0, maxVisibleEnemies - this.enemies.length);
    this.enemies.push(...(this.enemySpawner?.update(deltaSeconds, progress, enemySlots) ?? []));

    this.animatePlayer(delta);
    this.fireBullets(this.time.now);
    this.moveEnemies(deltaSeconds);
    this.moveCards(deltaSeconds);
    this.moveBullets(deltaSeconds);
    this.checkBulletHits();
    this.checkEnemyCollisions();
    this.checkCardCollisions();

    gameEvents.emit("run:update", this.snapshot());
    this.distanceText?.setText(`${Math.floor(this.distance)}m`);

    if (this.distance >= runDistanceGoal) {
      this.finishRun("complete");
    }
  }

  private createInput() {
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.idle) {
        return;
      }
      this.selectedLane = Phaser.Math.Clamp(this.pointerLane(pointer.x, road.playerY), centerLane, cardLane);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.idle) {
        this.selectedLane = Phaser.Math.Clamp(this.pointerLane(pointer.x, road.playerY), centerLane, cardLane);
      }
    });

    this.input.keyboard?.on("keydown-LEFT", () => {
      this.selectedLane = Phaser.Math.Clamp(this.selectedLane - 1, centerLane, cardLane);
    });
    this.input.keyboard?.on("keydown-RIGHT", () => {
      this.selectedLane = Phaser.Math.Clamp(this.selectedLane + 1, centerLane, cardLane);
    });
  }

  private animatePlayer(delta: number) {
    if (!this.player) {
      return;
    }

    const targetX = this.laneCenterX(this.selectedLane, road.playerY);
    this.player.container.x = Phaser.Math.Linear(this.player.container.x, targetX, Math.min(1, delta / 80));
    this.player.container.y = road.playerY + Math.sin(this.time.now / 130) * 4;
    this.player.update(this.time.now);
  }

  private spawnRightCard() {
    if (!this.player) {
      return;
    }

    const playerUnits = this.player.units;
    const timeToCollisionSeconds = (road.playerY - road.horizonY) / 160;
    const cardSpec = generateBalancedCard({
      playerUnits,
      distanceTravelled: this.distance,
      targetRunDistance: runDistanceGoal,
      timeToCollisionSeconds,
      random: () => Phaser.Math.FloatBetween(0, 1)
    });

    const card = new NumberCard(this, cardLane, road.horizonY + 5, cardSpec.value);
    card.container.setData("balance", cardSpec);
    this.applyPerspective(card.container, cardLane, card.y);
    this.cards.push(card);

    if (window.localStorage.getItem("odd-orbit:debug-card-balance") === "true") {
      console.table([
        {
          lane: cardLane,
          units: playerUnits,
          progress: (this.distance / runDistanceGoal).toFixed(2),
          difficulty: cardSpec.difficulty,
          expectedHits: cardSpec.expectedHits.toFixed(1),
          start: cardSpec.value,
          estimatedCollision: cardSpec.estimatedValueAtCollision.toFixed(1)
        }
      ]);
    }
  }

  private fireBullets(timeMs: number) {
    if (!this.player) {
      return;
    }

    for (const shooter of this.player.readyShooters(timeMs)) {
      const velocity = this.bulletVelocityForLane(this.selectedLane, shooter.x, shooter.y);
      const bullet = new Bullet(this, this.selectedLane, shooter.x, shooter.y, velocity);
      bullet.container.setDepth(850);
      this.bullets.push(bullet);
    }
  }

  private moveCards(deltaSeconds: number) {
    for (const card of this.cards) {
      card.y += 160 * deltaSeconds;
      this.applyPerspective(card.container, card.lane, card.y);
    }

    this.cards = this.cards.filter((card) => {
      if (card.y > 780) {
        card.destroy();
        return false;
      }
      return true;
    });
  }

  private moveEnemies(deltaSeconds: number) {
    for (const enemy of this.enemies) {
      enemy.y += enemy.speed * deltaSeconds;
      const wobble = Math.sin(this.time.now * 0.001 * enemy.wobbleSpeed + enemy.seed) * enemy.wobbleAmount;
      this.applyPerspective(enemy.container, enemy.lane, enemy.y, enemy.xOffset + wobble);
    }

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.y > 780) {
        enemy.destroy();
        return false;
      }
      return true;
    });
  }

  private moveBullets(deltaSeconds: number) {
    for (const bullet of this.bullets) {
      if (bullet.state === "impacting") {
        bullet.container.setAlpha(Math.max(0, bullet.container.alpha - deltaSeconds * 12));
        continue;
      }

      bullet.beginFrame();
      bullet.container.x += bullet.velocity.x * deltaSeconds;
      bullet.container.y += bullet.velocity.y * deltaSeconds;
      bullet.y = bullet.container.y;
      bullet.container.y = bullet.y;
      bullet.container.setScale(Phaser.Math.Clamp(this.scaleAtY(bullet.y) * 0.82, 0.36, 1));
    }

    this.bullets = this.bullets.filter((bullet) => {
      if (bullet.state === "impacting" && this.time.now >= bullet.impactUntil) {
        bullet.destroy();
        return false;
      }
      if (bullet.y < -120 || bullet.container.x < -80 || bullet.container.x > 470) {
        bullet.destroy();
        return false;
      }
      return true;
    });
  }

  private checkBulletHits() {
    for (const bullet of this.bullets) {
      if (bullet.state !== "flying") {
        continue;
      }

      let hitSomething = false;
      for (const enemy of this.enemies) {
        if (bullet.lane !== centerLane || !this.didBulletSegmentHitEnemy(bullet, enemy)) {
          continue;
        }
        const impactPoint = this.penetratedImpactPoint(bullet, enemy);
        enemy.health -= 1;
        bullet.impact(impactPoint.x, impactPoint.y, this.time.now);
        this.createImpactFlash(impactPoint.x, impactPoint.y);
        if (enemy.health <= 0) {
          enemy.destroy();
        }
        hitSomething = true;
        break;
      }

      if (hitSomething) {
        continue;
      }

      for (const card of this.cards) {
        if (card.lane !== bullet.lane || Math.abs(card.y - bullet.y) > 30) {
          continue;
        }
        const direction = bullet.velocity.clone().normalize();
        card.hit();
        bullet.impact(bullet.container.x + direction.x * 10, bullet.container.y + direction.y * 10, this.time.now);
        break;
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.container.active);
    this.bullets = this.bullets.filter((bullet) => bullet.container.active);
  }

  private checkEnemyCollisions() {
    if (!this.player) {
      return;
    }

    for (const enemy of this.enemies) {
      if (enemy.lane !== this.selectedLane || Math.abs(enemy.y - road.playerY) > 34) {
        continue;
      }

      this.player.setUnits(this.player.units - 1);
      enemy.destroy();
      this.cameras.main.shake(90, 0.005);

      if (this.player.units <= 0) {
        this.finishRun("game-over");
        break;
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.container.active);
  }

  private checkCardCollisions() {
    if (!this.player) {
      return;
    }

    for (const card of this.cards) {
      if (card.lane !== this.selectedLane || Math.abs(card.y - road.playerY) > 40) {
        continue;
      }

      this.player.setUnits(this.player.units + card.value);
      card.destroy();
      this.cameras.main.shake(80, 0.004);

      if (this.player.units <= 0) {
        this.finishRun("game-over");
        break;
      }
    }

    this.cards = this.cards.filter((card) => card.container.active);
  }

  private snapshot() {
    return {
      units: this.player?.units ?? 1,
      distance: Math.floor(this.distance),
      distanceGoal: runDistanceGoal
    };
  }

  private finishRun(status: RunResult["status"]) {
    if (this.ending || !this.player) {
      return;
    }

    this.ending = true;
    const result: RunResult = {
      status,
      distance: Math.floor(this.distance),
      units: Math.max(0, this.player.units),
      message: status === "complete" ? "Run complete." : "Game over.",
      completedAt: new Date().toISOString()
    };
    this.cameras.main.fadeOut(260, 7, 19, 29);
    this.time.delayedCall(280, () => {
      gameEvents.emit("run:end", result);
      this.scene.pause();
    });
  }

  private laneCenterX(lane: number, y: number) {
    const width = this.roadWidthAtY(y);
    const left = road.centerX - width / 2;
    return left + ((lane + 0.5) / laneCount) * width;
  }

  private roadWidthAtY(y: number) {
    const progress = Phaser.Math.Clamp((y - road.horizonY) / (road.bottomY - road.horizonY), 0, 1);
    return Phaser.Math.Linear(road.topWidth, road.bottomWidth, progress);
  }

  private scaleAtY(y: number) {
    const progress = Phaser.Math.Clamp((y - road.horizonY) / (road.bottomY - road.horizonY), 0, 1);
    return Phaser.Math.Linear(0.34, 1.18, progress);
  }

  private applyPerspective(body: Phaser.GameObjects.Container, lane: number, y: number, xOffset = 0) {
    body.x = this.laneCenterX(lane, y) + xOffset * this.scaleAtY(y);
    body.y = y;
    body.setScale(this.scaleAtY(y));
    body.setDepth(Math.floor(y));
  }

  private bulletVelocityForLane(lane: number, x: number, y: number) {
    const targetY = road.horizonY - 150 + Phaser.Math.FloatBetween(-26, 18);
    const targetX = this.laneCenterX(lane, road.horizonY + 18) + Phaser.Math.FloatBetween(-14, 14);
    const direction = new Phaser.Math.Vector2(targetX - x, targetY - y).normalize();

    return direction.scale(610);
  }

  private didBulletSegmentHitEnemy(bullet: Bullet, enemy: EnemySphere) {
    const closest = this.closestPointOnSegment(
      bullet.previousPosition.x,
      bullet.previousPosition.y,
      bullet.container.x,
      bullet.container.y,
      enemy.container.x,
      enemy.container.y
    );
    const hitRadius = enemy.radius * enemy.container.scaleX * 1.02;
    return Phaser.Math.Distance.Between(closest.x, closest.y, enemy.container.x, enemy.container.y) <= hitRadius;
  }

  private penetratedImpactPoint(bullet: Bullet, enemy: EnemySphere) {
    const direction = bullet.velocity.clone().normalize();
    return {
      x: enemy.container.x + direction.x * enemy.radius * enemy.container.scaleX * 0.45,
      y: enemy.container.y + direction.y * enemy.radius * enemy.container.scaleY * 0.45
    };
  }

  private closestPointOnSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
    const abx = bx - ax;
    const aby = by - ay;
    const abLengthSquared = abx * abx + aby * aby;
    if (abLengthSquared === 0) {
      return { x: ax, y: ay };
    }

    const t = Phaser.Math.Clamp(((px - ax) * abx + (py - ay) * aby) / abLengthSquared, 0, 1);
    return {
      x: ax + abx * t,
      y: ay + aby * t
    };
  }

  private createImpactFlash(x: number, y: number) {
    const flash = this.add.circle(x, y, 5, 0xfff0a0, 0.85);
    flash.setDepth(860);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.9,
      duration: 80,
      onComplete: () => flash.destroy()
    });
  }

  private pointerLane(x: number, y: number) {
    const width = this.roadWidthAtY(y);
    const left = road.centerX - width / 2;
    return Math.floor(((x - left) / width) * laneCount);
  }
}
