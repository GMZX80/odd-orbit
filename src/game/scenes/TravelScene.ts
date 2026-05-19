import Phaser from "phaser";
import { ParallaxSpaceScene } from "../background/ParallaxSpaceScene";
import { BroodCore } from "../entities/BroodCore";
import { BroodCoreSpawner } from "../entities/BroodCoreSpawner";
import { Bullet } from "../entities/Bullet";
import { EnemySphere } from "../entities/EnemySphere";
import { EnemySwarmSpawner } from "../entities/EnemySwarmSpawner";
import { NumberCard } from "../entities/NumberCard";
import { PlayerSwarm } from "../entities/PlayerSwarm";
import { SidewinderMissile } from "../entities/SidewinderMissile";
import { Wormhole } from "../entities/Wormhole";
import { gameEvents } from "../events";
import { playWarpEffect } from "../effects/WarpEffect";
import { generateBalancedCard } from "../systems/cardBalancing";
import { routeEnemyThemeForFaction, type RouteEnemyTheme } from "../systems/factionTheme";
import type { WormholeRunInput } from "../systems/galaxyTypes";
import type { RunResult } from "../systems/runTypes";
import { TRAVEL_COMBAT, TRAVEL_LANES, TRAVEL_LIMITS, TRAVEL_ROAD, TRAVEL_RUN } from "../travel/travelConfig";
import {
  applyTravelPerspective,
  closestPointOnSegment,
  travelBroodCoreRuptureY,
  travelDefenceLineY,
  travelLaneCenterX,
  travelPointerLane,
  travelScaleAtY,
  travelWormholeRestPosition
} from "../travel/travelGeometry";

interface TravelSceneData {
  idle?: boolean;
  runInput?: WormholeRunInput;
  startingUnits?: number;
}

export class TravelScene extends Phaser.Scene {
  private player?: PlayerSwarm;
  private cards: NumberCard[] = [];
  private enemies: EnemySphere[] = [];
  private broodCores: BroodCore[] = [];
  private bullets: Bullet[] = [];
  private sidewinders: SidewinderMissile[] = [];
  private wormhole?: Wormhole;
  private enemySpawner?: EnemySwarmSpawner;
  private broodCoreSpawner?: BroodCoreSpawner;
  private selectedLane: number = TRAVEL_LANES.center;
  private cardSpawnTimer = 1.1;
  private nextSidewinderAt = 0;
  private distance = 0;
  private idle = true;
  private ending = false;
  private escaping = false;
  private startingUnits = 1;
  private runInput?: WormholeRunInput;
  private enemyTheme: RouteEnemyTheme = routeEnemyThemeForFaction("neutral");
  private distanceText?: Phaser.GameObjects.Text;
  private spaceScene?: ParallaxSpaceScene;
  private inputCleanups: Array<() => void> = [];
  private readonly handleSceneShutdown = () => {
    this.destroyInput();
  };

  constructor() {
    super("TravelScene");
  }

  create(data: TravelSceneData = {}) {
    this.registerSceneLifecycleCleanup();
    this.destroyInput();
    this.idle = Boolean(data.idle);
    this.runInput = data.runInput;
    this.enemyTheme = this.resolveRouteEnemyTheme();
    this.startingUnits = Math.max(1, Math.floor(data.runInput?.startingUnits ?? data.startingUnits ?? 1));
    this.ending = false;
    this.escaping = false;
    this.selectedLane = TRAVEL_LANES.center;
    this.cardSpawnTimer = this.nextCardSpawnDelay(0);
    this.nextSidewinderAt = this.time.now + Phaser.Math.Between(2600, 4200);
    this.distance = 0;
    this.cards.forEach((card) => card.destroy());
    this.enemies.forEach((enemy) => enemy.destroy());
    this.broodCores.forEach((broodCore) => broodCore.destroy());
    this.bullets.forEach((bullet) => bullet.destroy());
    this.sidewinders.forEach((missile) => missile.destroy());
    this.wormhole?.destroy();
    this.spaceScene?.destroy();
    this.cards = [];
    this.enemies = [];
    this.broodCores = [];
    this.bullets = [];
    this.sidewinders = [];

    this.spaceScene = new ParallaxSpaceScene(this);
    this.wormhole = new Wormhole(this, TRAVEL_LANES.left, this.wormholeRestPosition().y);
    this.positionDormantWormhole();
    this.player = new PlayerSwarm(this, travelLaneCenterX(this.selectedLane, TRAVEL_ROAD.playerY), TRAVEL_ROAD.playerY);
    this.player.setUnits(this.startingUnits);
    this.player.container.setDepth(900);
    this.enemySpawner = new EnemySwarmSpawner(this, { lane: TRAVEL_LANES.center, spawnY: TRAVEL_ROAD.horizonY - 12, theme: this.enemyTheme });
    this.broodCoreSpawner = new BroodCoreSpawner(this, { lane: TRAVEL_LANES.center, spawnY: TRAVEL_ROAD.horizonY - 28, theme: this.enemyTheme });
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

    if (this.escaping) {
      this.wormhole?.update(this.time.now, deltaSeconds);
      return;
    }

    if (!this.player || this.idle || this.ending) {
      this.animatePlayer(delta);
      return;
    }

    const progress = this.effectiveRunProgress();
    this.distance += 80 * deltaSeconds;
    this.cardSpawnTimer -= deltaSeconds;

    if (this.cardSpawnTimer <= 0) {
      this.cardSpawnTimer = this.nextCardSpawnDelay(progress);
      this.spawnRightCard();
    }
    const enemySlots = Math.max(0, TRAVEL_LIMITS.maxVisibleEnemies - this.enemies.length);
    this.enemies.push(...(this.enemySpawner?.update(deltaSeconds, progress, enemySlots) ?? []));
    const broodCore = this.broodCoreSpawner?.update(this.distance, progress, this.broodCores.length);
    if (broodCore && this.broodCores.length < TRAVEL_LIMITS.maxActiveBroodCores) {
      applyTravelPerspective(broodCore.container, broodCore.lane, broodCore.y, broodCore.xOffset);
      this.broodCores.push(broodCore);
    }

    this.animatePlayer(delta);
    this.fireBullets(this.time.now);
    this.fireSidewinderIfReady(this.time.now);
    this.moveEnemies(deltaSeconds);
    this.moveBroodCores(deltaSeconds);
    this.moveCards(deltaSeconds);
    this.updateWormhole(deltaSeconds);
    this.moveBullets(deltaSeconds);
    this.moveSidewinders(deltaSeconds);
    this.checkBulletHits();
    this.checkSidewinderHits();
    this.checkEnemyCollisions();
    this.checkCardCollisions();

    gameEvents.emit("run:update", this.snapshot());
    this.distanceText?.setText(`${Math.floor(this.distance)}m`);
  }

  private resolveRouteEnemyTheme() {
    const factionId = this.runInput?.destinationFactionId ?? "neutral";
    const theme = routeEnemyThemeForFaction(factionId);
    return {
      ...theme,
      fill: this.runInput?.destinationFactionColor ?? theme.fill
    };
  }

  private registerSceneLifecycleCleanup() {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.handleSceneShutdown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleSceneShutdown);
  }

  private createInput() {
    this.destroyInput();

    const onPointerMove = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.idle) {
        return;
      }
      this.selectedLane = Phaser.Math.Clamp(travelPointerLane(pointer.x, TRAVEL_ROAD.playerY), TRAVEL_LANES.left, TRAVEL_LANES.card);
    };

    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      if (!this.idle) {
        this.selectedLane = Phaser.Math.Clamp(travelPointerLane(pointer.x, TRAVEL_ROAD.playerY), TRAVEL_LANES.left, TRAVEL_LANES.card);
      }
    };

    const onLeft = () => {
      this.selectedLane = Phaser.Math.Clamp(this.selectedLane - 1, TRAVEL_LANES.left, TRAVEL_LANES.card);
    };

    const onRight = () => {
      this.selectedLane = Phaser.Math.Clamp(this.selectedLane + 1, TRAVEL_LANES.left, TRAVEL_LANES.card);
    };

    this.input.on("pointermove", onPointerMove);
    this.input.on("pointerdown", onPointerDown);
    this.inputCleanups.push(() => {
      this.input.off("pointermove", onPointerMove);
      this.input.off("pointerdown", onPointerDown);
    });

    this.input.keyboard?.on("keydown-LEFT", onLeft);
    this.input.keyboard?.on("keydown-RIGHT", onRight);
    this.inputCleanups.push(() => {
      this.input.keyboard?.off("keydown-LEFT", onLeft);
      this.input.keyboard?.off("keydown-RIGHT", onRight);
    });
  }

  private destroyInput() {
    for (const cleanup of this.inputCleanups) {
      cleanup();
    }
    this.inputCleanups = [];
  }

  private animatePlayer(delta: number) {
    if (!this.player) {
      return;
    }

    const targetX = travelLaneCenterX(this.selectedLane, TRAVEL_ROAD.playerY);
    this.player.container.x = Phaser.Math.Linear(this.player.container.x, targetX, Math.min(1, delta / 80));
    this.player.container.y = TRAVEL_ROAD.playerY + Math.sin(this.time.now / 130) * 4;
    this.player.update(this.time.now);
  }

  private spawnRightCard() {
    if (!this.player) {
      return;
    }

    const playerUnits = this.player.units;
    const spawnY = TRAVEL_ROAD.horizonY + Phaser.Math.FloatBetween(-8, 18);
    const timeToCollisionSeconds = (TRAVEL_ROAD.playerY - spawnY) / 160;
    const effectiveDistanceTravelled = this.effectiveDistanceTravelled();
    const cardSpec = generateBalancedCard({
      playerUnits,
      distanceTravelled: effectiveDistanceTravelled,
      targetRunDistance: TRAVEL_RUN.distanceGoal,
      timeToCollisionSeconds,
      random: () => Phaser.Math.FloatBetween(0, 1)
    });

    const important = Phaser.Math.FloatBetween(0, 1) < 0.16;
    const card = new NumberCard(this, TRAVEL_LANES.card, spawnY, cardSpec.value, {
      xOffset: Phaser.Math.FloatBetween(-16, 18),
      visualScale: important ? Phaser.Math.FloatBetween(1.08, 1.18) : Phaser.Math.FloatBetween(0.88, 1.08),
      rotation: Phaser.Math.FloatBetween(-9, 9),
      ringThickness: Phaser.Math.FloatBetween(3.2, important ? 5.8 : 5),
      glowAlphaScale: Phaser.Math.FloatBetween(0.82, important ? 1.28 : 1.12),
      nodeScale: Phaser.Math.FloatBetween(0.86, important ? 1.28 : 1.12),
      important
    });
    card.container.setData("balance", cardSpec);
    applyTravelPerspective(card.container, TRAVEL_LANES.card, card.y, card.xOffset);
    this.cards.push(card);

    if (window.localStorage.getItem("odd-orbit:debug-card-balance") === "true") {
      console.table([
        {
          lane: TRAVEL_LANES.card,
          units: playerUnits,
          progress: (effectiveDistanceTravelled / TRAVEL_RUN.distanceGoal).toFixed(2),
          difficulty: cardSpec.difficulty,
          expectedHits: cardSpec.expectedHits.toFixed(1),
          start: cardSpec.value,
          estimatedCollision: cardSpec.estimatedValueAtCollision.toFixed(1)
        }
      ]);
    }
  }

  private nextCardSpawnDelay(progress: number) {
    const baseDelay = Phaser.Math.Linear(1.72, 1.1, progress);
    const roll = Phaser.Math.FloatBetween(0, 1);

    if (roll < 0.16) {
      return Phaser.Math.FloatBetween(0.72, 1.02);
    }
    if (roll > 0.84) {
      return Phaser.Math.FloatBetween(2.05, 2.75);
    }
    return Phaser.Math.FloatBetween(baseDelay * 0.82, baseDelay * 1.36);
  }

  private effectiveRunProgress() {
    return Phaser.Math.Clamp(this.distance / TRAVEL_RUN.distanceGoal + this.routeDifficultyOffset(), 0, 1);
  }

  private effectiveDistanceTravelled() {
    return Phaser.Math.Clamp(this.distance + this.routeDifficultyOffset() * TRAVEL_RUN.distanceGoal, 0, TRAVEL_RUN.distanceGoal);
  }

  private routeDifficultyOffset() {
    switch (this.runInput?.routeDifficulty) {
      case "hard":
        return 0.24;
      case "normal":
        return 0.12;
      case "easy":
      default:
        return 0;
    }
  }

  private fireBullets(timeMs: number) {
    if (!this.player) {
      return;
    }

    for (const shooter of this.player.readyShooters(timeMs)) {
      const velocity = this.bulletVelocityForLane(this.selectedLane, shooter.x, shooter.y, shooter.aimBiasX);
      const bullet = new Bullet(this, this.selectedLane, shooter.x, shooter.y, velocity);
      bullet.container.setDepth(850);
      this.bullets.push(bullet);
    }
  }

  private fireSidewinderIfReady(timeMs: number) {
    if (!this.player || this.sidewinders.length >= TRAVEL_LIMITS.maxActiveSidewinders || timeMs < this.nextSidewinderAt) {
      return;
    }

    const target = this.selectSidewinderTarget();
    if (!target) {
      this.nextSidewinderAt = timeMs + Phaser.Math.Between(900, 1400);
      return;
    }

    const launchPosition = this.player.sidewinderLaunchPosition();
    if (!launchPosition) {
      return;
    }

    const missile = new SidewinderMissile(this, launchPosition.x, launchPosition.y, target, timeMs);
    missile.container.setDepth(855);
    this.sidewinders.push(missile);

    const unitCooldownBonus = Math.min(650, Math.sqrt(this.player.units) * 95);
    this.nextSidewinderAt = timeMs + Phaser.Math.Between(3400, 5000) - unitCooldownBonus;
  }

  private moveCards(deltaSeconds: number) {
    for (const card of this.cards) {
      card.y += 160 * deltaSeconds;
      applyTravelPerspective(card.container, card.lane, card.y, card.xOffset);
    }

    this.cards = this.cards.filter((card) => {
      if (card.y > 780) {
        card.destroy();
        return false;
      }
      return true;
    });
  }

  private updateWormhole(deltaSeconds: number) {
    if (!this.wormhole) {
      return;
    }

    this.wormhole.update(this.time.now, deltaSeconds);

    if (this.wormhole.state === "descending") {
      this.moveWormholeTowardPlayer(deltaSeconds);
      return;
    }

    if (this.wormhole.state !== "teleporting") {
      this.positionDormantWormhole();
    }
  }

  private moveEnemies(deltaSeconds: number) {
    for (const enemy of this.enemies) {
      let speed = enemy.speed;
      if (enemy.burstTimeRemaining > 0) {
        const burstRatio = enemy.burstDuration > 0 ? Phaser.Math.Clamp(enemy.burstTimeRemaining / enemy.burstDuration, 0, 1) : 0;
        enemy.xOffset = Phaser.Math.Clamp(enemy.xOffset + enemy.burstVelocityX * burstRatio * deltaSeconds, -78, 78);
        speed += enemy.burstVelocityY * burstRatio;
        enemy.burstTimeRemaining = Math.max(0, enemy.burstTimeRemaining - deltaSeconds);
      }
      enemy.y += speed * deltaSeconds;
      const wobble = Math.sin(this.time.now * 0.001 * enemy.wobbleSpeed + enemy.seed) * enemy.wobbleAmount;
      applyTravelPerspective(enemy.container, enemy.lane, enemy.y, enemy.xOffset + wobble);
    }

    const defenceLineY = this.defenceLineY();
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.y >= defenceLineY) {
        this.applyBreakthroughDamage(enemy, defenceLineY);
        enemy.destroy();
        return false;
      }
      if (enemy.y > 780) {
        enemy.destroy();
        return false;
      }
      return true;
    });
  }

  private moveBroodCores(deltaSeconds: number) {
    const ruptureY = travelBroodCoreRuptureY(this.scale.height || TRAVEL_ROAD.bottomY);

    for (const broodCore of this.broodCores) {
      if (broodCore.state === "descending") {
        broodCore.y += broodCore.speed * deltaSeconds;
      }

      broodCore.update(this.time.now, ruptureY);
      const warningShake = broodCore.state === "ruptureWarning" ? Math.sin(this.time.now * 0.034 + broodCore.seed) * 4 : 0;
      const wobble = Math.sin(this.time.now * 0.001 * broodCore.wobbleSpeed + broodCore.seed) * broodCore.wobbleAmount + warningShake;
      applyTravelPerspective(broodCore.container, broodCore.lane, broodCore.y, broodCore.xOffset + wobble);
    }

    this.broodCores = this.broodCores.filter((broodCore) => {
      if (broodCore.shouldRupture(this.time.now)) {
        this.ruptureBroodCore(broodCore);
        return false;
      }
      if (broodCore.container.active) {
        return true;
      }
      if (broodCore.y > 790) {
        broodCore.destroy();
        return false;
      }
      return false;
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
      bullet.container.setScale(Phaser.Math.Clamp(travelScaleAtY(bullet.y) * 0.82, 0.36, 1));
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

  private moveSidewinders(deltaSeconds: number) {
    this.sidewinders = this.sidewinders.filter((missile) => {
      if (!missile.update(this.time.now, deltaSeconds)) {
        missile.destroy();
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
      for (const broodCore of this.broodCores) {
        if (!broodCore.container.active || !broodCore.canBeHit() || bullet.lane !== TRAVEL_LANES.center || !this.didBulletSegmentHitEnemy(bullet, broodCore)) {
          continue;
        }
        const impactPoint = this.penetratedImpactPoint(bullet, broodCore);
        broodCore.hit(1, this.time.now);
        bullet.impact(impactPoint.x, impactPoint.y, this.time.now);
        this.createImpactFlash(impactPoint.x, impactPoint.y, this.enemyTheme.flash);
        if (broodCore.health <= 0) {
          this.destroyBroodCore(broodCore);
        }
        hitSomething = true;
        break;
      }

      if (hitSomething) {
        continue;
      }

      for (const enemy of this.enemies) {
        if (bullet.lane !== TRAVEL_LANES.center || !this.didBulletSegmentHitEnemy(bullet, enemy)) {
          continue;
        }
        const impactPoint = this.penetratedImpactPoint(bullet, enemy);
        enemy.health -= 1;
        bullet.impact(impactPoint.x, impactPoint.y, this.time.now);
        this.createImpactFlash(impactPoint.x, impactPoint.y, this.enemyTheme.flash);
        if (enemy.health <= 0) {
          enemy.destroy();
        }
        hitSomething = true;
        break;
      }

      if (hitSomething) {
        continue;
      }

      if (
        this.wormhole &&
        bullet.lane === this.wormhole.lane &&
        this.wormhole.canBeHit() &&
        this.didBulletSegmentHitWormhole(bullet, this.wormhole)
      ) {
        const direction = bullet.velocity.clone().normalize();
        const impactX = this.wormhole.container.x + direction.x * this.wormhole.hitRadius * this.wormhole.container.scaleX * 0.42;
        const impactY = this.wormhole.container.y + direction.y * this.wormhole.hitRadius * this.wormhole.container.scaleY * 0.42;
        this.wormhole.hit(this.time.now, this.player?.units ?? 1);
        bullet.impact(impactX, impactY, this.time.now);
        this.createImpactFlash(impactX, impactY, 0x9effff);
        hitSomething = true;
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

    this.broodCores = this.broodCores.filter((broodCore) => broodCore.container.active);
    this.enemies = this.enemies.filter((enemy) => enemy.container.active);
    this.bullets = this.bullets.filter((bullet) => bullet.container.active);
  }

  private checkSidewinderHits() {
    for (const missile of this.sidewinders) {
      if (!missile.container.active) {
        continue;
      }

      const target = missile.target;
      if (target instanceof BroodCore && target.container.active && target.canBeHit() && this.didSidewinderHitEnemy(missile, target)) {
        this.damageBroodCoreFromSidewinder(missile, target);
        continue;
      }
      if (target instanceof EnemySphere && target.container.active && this.didSidewinderHitEnemy(missile, target)) {
        this.destroyEnemyFromSidewinder(missile, target);
        continue;
      }

      for (const enemy of this.enemies) {
        if (!enemy.container.active || !this.didSidewinderHitEnemy(missile, enemy)) {
          continue;
        }
        this.destroyEnemyFromSidewinder(missile, enemy);
        break;
      }

      if (!missile.container.active) {
        continue;
      }

      for (const broodCore of this.broodCores) {
        if (!broodCore.container.active || !broodCore.canBeHit() || !this.didSidewinderHitEnemy(missile, broodCore)) {
          continue;
        }
        this.damageBroodCoreFromSidewinder(missile, broodCore);
        break;
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.container.active);
    this.broodCores = this.broodCores.filter((broodCore) => broodCore.container.active);
    this.sidewinders = this.sidewinders.filter((missile) => missile.container.active);
  }

  private checkEnemyCollisions() {
    if (!this.player) {
      return;
    }

    for (const enemy of this.enemies) {
      if (enemy.lane !== this.selectedLane || Math.abs(enemy.y - TRAVEL_ROAD.playerY) > 34) {
        continue;
      }

      this.applyBreakthroughDamage(enemy, enemy.container.y);
      enemy.destroy();

      if (this.player.units <= 0) {
        break;
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.container.active);
  }

  private applyBreakthroughDamage(enemy: EnemySphere, defenceLineY: number) {
    if (!this.player || this.ending) {
      return;
    }

    this.player.playDamageFeedback();
    this.player.setUnits(Math.max(0, this.player.units - 1));
    this.createBreakthroughFeedback(enemy.container.x, defenceLineY, 1);
    this.cameras.main.shake(85, 0.004);
    gameEvents.emit("run:damage", { units: this.player.units });
    gameEvents.emit("run:update", this.snapshot());

    if (this.player.units <= 0) {
      this.finishRun("game-over");
    }
  }

  private checkCardCollisions() {
    if (!this.player) {
      return;
    }

    for (const card of this.cards) {
      if (card.lane !== this.selectedLane || Math.abs(card.y - TRAVEL_ROAD.playerY) > 40) {
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
      distanceGoal: TRAVEL_RUN.distanceGoal
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
      escaped: status === "complete",
      startingUnits: this.startingUnits,
      finalUnits: Math.max(0, this.player.units),
      distanceTravelled: Math.floor(this.distance),
      failureReason: status === "complete" ? undefined : "runner-failed",
      runInput: this.runInput,
      message: status === "complete" ? "Escaped through the wormhole!" : "Game over.",
      completedAt: new Date().toISOString()
    };
    this.cameras.main.fadeOut(260, 7, 19, 29);
    this.time.delayedCall(280, () => {
      gameEvents.emit("run:end", result);
      this.scene.pause();
    });
  }

  private bulletVelocityForLane(lane: number, x: number, y: number, aimBiasX: number) {
    if (lane === TRAVEL_LANES.left && this.wormhole?.canBeHit()) {
      const target = this.wormholeRestPosition();
      target.x += aimBiasX * 0.35 + Phaser.Math.FloatBetween(-TRAVEL_COMBAT.wormholeAimSpreadX, TRAVEL_COMBAT.wormholeAimSpreadX);
      target.y += Phaser.Math.FloatBetween(-14, 14);
      return new Phaser.Math.Vector2(target.x - x, target.y - y).normalize().scale(610);
    }

    const targetY = TRAVEL_ROAD.horizonY - 150 + Phaser.Math.FloatBetween(-26, 18);
    const targetX = travelLaneCenterX(lane, TRAVEL_ROAD.horizonY + 18) + aimBiasX + Phaser.Math.FloatBetween(-TRAVEL_COMBAT.bulletAimSpreadX, TRAVEL_COMBAT.bulletAimSpreadX);
    const direction = new Phaser.Math.Vector2(targetX - x, targetY - y).normalize();

    return direction.scale(610);
  }

  private didBulletSegmentHitEnemy(bullet: Bullet, enemy: EnemySphere | BroodCore) {
    const closest = closestPointOnSegment(
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

  private penetratedImpactPoint(bullet: Bullet, enemy: EnemySphere | BroodCore) {
    const direction = bullet.velocity.clone().normalize();
    return {
      x: enemy.container.x + direction.x * enemy.radius * enemy.container.scaleX * 0.45,
      y: enemy.container.y + direction.y * enemy.radius * enemy.container.scaleY * 0.45
    };
  }

  private didBulletSegmentHitWormhole(bullet: Bullet, wormhole: Wormhole) {
    const closest = closestPointOnSegment(
      bullet.previousPosition.x,
      bullet.previousPosition.y,
      bullet.container.x,
      bullet.container.y,
      wormhole.container.x,
      wormhole.container.y
    );
    const hitRadius = wormhole.hitRadius * wormhole.container.scaleX;
    return Phaser.Math.Distance.Between(closest.x, closest.y, wormhole.container.x, wormhole.container.y) <= hitRadius;
  }

  private didSidewinderHitEnemy(missile: SidewinderMissile, enemy: EnemySphere | BroodCore) {
    const hitRadius = enemy.radius * enemy.container.scaleX + missile.hitRadius * missile.container.scaleX;
    return Phaser.Math.Distance.Between(missile.container.x, missile.container.y, enemy.container.x, enemy.container.y) <= hitRadius;
  }

  private destroyEnemyFromSidewinder(missile: SidewinderMissile, enemy: EnemySphere) {
    const impactX = enemy.container.x;
    const impactY = enemy.container.y;
    enemy.destroy();
    missile.destroy();
    this.createImpactFlash(impactX, impactY, this.enemyTheme.flash);
  }

  private damageBroodCoreFromSidewinder(missile: SidewinderMissile, broodCore: BroodCore) {
    const impactX = broodCore.container.x;
    const impactY = broodCore.container.y;
    broodCore.hit(TRAVEL_COMBAT.sidewinderDamageToBroodCore, this.time.now);
    missile.destroy();
    this.createImpactFlash(impactX, impactY, this.enemyTheme.flash);

    if (broodCore.health <= 0) {
      this.destroyBroodCore(broodCore);
    }
  }

  private destroyBroodCore(broodCore: BroodCore) {
    const x = broodCore.container.x;
    const y = broodCore.container.y;
    const radius = broodCore.radius * broodCore.container.scaleX;
    broodCore.markDestroyed();
    broodCore.destroy();
    this.createBroodCoreDestructionEffect(x, y, radius);
  }

  private selectSidewinderTarget() {
    const defenceLineY = this.defenceLineY();
    const candidates = this.enemies
      .filter((enemy) => enemy.container.active && enemy.lane === TRAVEL_LANES.center)
      .filter((enemy) => enemy.y < defenceLineY - 80 && enemy.y > TRAVEL_ROAD.horizonY - 20)
      .map((enemy) => {
        const laneCenter = travelLaneCenterX(TRAVEL_LANES.center, enemy.y);
        return {
          enemy,
          outlierScore: Math.abs(enemy.container.x - laneCenter)
        };
      })
      .filter((candidate) => candidate.outlierScore > 18)
      .sort((a, b) => b.outlierScore - a.outlierScore);

    if (candidates.length === 0) {
      return this.broodCores.find((broodCore) => broodCore.container.active && broodCore.canBeHit() && broodCore.y < defenceLineY - 110 && broodCore.y > TRAVEL_ROAD.horizonY - 28);
    }

    const targetPool = candidates.slice(0, Math.min(5, candidates.length));
    return targetPool[Phaser.Math.Between(0, targetPool.length - 1)].enemy;
  }

  private defenceLineY() {
    return travelDefenceLineY(this.player?.container.y ?? TRAVEL_ROAD.playerY);
  }

  private ruptureBroodCore(broodCore: BroodCore) {
    if (!this.player) {
      broodCore.destroy();
      return;
    }

    const x = broodCore.container.x;
    const y = broodCore.container.y;
    const radius = broodCore.radius * broodCore.container.scaleX;
    broodCore.markRupturing();
    broodCore.destroy();
    this.createBroodCoreRuptureEffect(x, y, radius);
    this.spawnBroodRuptureEnemies(x, y);
    this.cameras.main.shake(190, 0.007);
  }

  private spawnBroodRuptureEnemies(x: number, y: number) {
    if (!this.player) {
      return;
    }

    const desiredCount = Phaser.Math.Clamp(Math.round(this.player.units * 0.9), 24, 100);
    const allowedCount = Math.min(desiredCount, Math.max(24, TRAVEL_LIMITS.maxEnemiesAfterBroodRupture - this.enemies.length));
    const baseScale = travelScaleAtY(y);
    const baseLaneCenter = travelLaneCenterX(TRAVEL_LANES.center, y);
    const baseXOffset = (x - baseLaneCenter) / Math.max(0.1, baseScale);
    const progress = this.effectiveRunProgress();

    for (let index = 0; index < allowedCount; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spraySpeed = Phaser.Math.FloatBetween(120, 270);
      const sprayX = Math.cos(angle) * spraySpeed;
      const sprayY = Math.sin(angle) * spraySpeed;
      const enemy = new EnemySphere(
        this,
        TRAVEL_LANES.center,
        y + Phaser.Math.FloatBetween(-16, 16),
        Phaser.Math.Clamp(baseXOffset + Phaser.Math.FloatBetween(-14, 14), -64, 64),
        Phaser.Math.FloatBetween(64, 86) + progress * 46,
        Phaser.Math.FloatBetween(5.8, 7.8),
        this.time.now * 0.001 + index * 5.73,
        this.enemyTheme
      );
      enemy.configureBurst(sprayX, sprayY, Phaser.Math.FloatBetween(0.82, 1.18));
      applyTravelPerspective(enemy.container, enemy.lane, enemy.y, enemy.xOffset);
      this.enemies.push(enemy);
    }
  }

  private positionDormantWormhole() {
    if (!this.wormhole) {
      return;
    }

    const position = this.wormholeRestPosition();
    this.wormhole.y = position.y;
    this.wormhole.container.x = position.x;
    this.wormhole.container.y = position.y;
    const scale = this.wormhole.state === "open" ? Math.max(0.82, this.wormhole.container.scaleX) : 0.82;
    this.wormhole.container.setScale(scale);
    this.wormhole.container.setDepth(620);
  }

  private wormholeRestPosition() {
    return travelWormholeRestPosition(this.scale.width || 390, this.scale.height || 720);
  }

  private moveWormholeTowardPlayer(deltaSeconds: number) {
    if (!this.player || !this.wormhole) {
      return;
    }

    const targetX = this.player.container.x;
    const targetY = this.player.container.y - 8;
    const follow = Math.min(1, deltaSeconds * 1.65);
    this.wormhole.container.x = Phaser.Math.Linear(this.wormhole.container.x, targetX, follow);
    this.wormhole.container.y = Phaser.Math.Linear(this.wormhole.container.y, targetY, follow);
    this.wormhole.y = this.wormhole.container.y;
    this.wormhole.container.setScale(Phaser.Math.Linear(this.wormhole.container.scaleX, 1.12, Math.min(1, deltaSeconds * 2.2)));
    this.wormhole.container.setDepth(920);

    if (Phaser.Math.Distance.Between(this.wormhole.container.x, this.wormhole.container.y, targetX, targetY) < 34) {
      this.startEscapeTeleport();
    }
  }

  private startEscapeTeleport() {
    if (!this.player) {
      return;
    }

    this.escaping = true;
    this.wormhole?.startTeleporting();
    this.fadeActiveRunObjects();
    this.distanceText?.setText("Wormhole escape");
    playWarpEffect({
      scene: this,
      playerContainer: this.player.container,
      target: new Phaser.Math.Vector2(this.wormhole?.container.x ?? this.player.container.x, this.wormhole?.container.y ?? this.player.container.y),
      onComplete: () => {
        this.finishRun("complete");
      }
    });
  }

  private fadeActiveRunObjects() {
    const targets: Phaser.GameObjects.GameObject[] = [
      ...this.enemies.map((enemy) => enemy.container),
      ...this.broodCores.map((broodCore) => broodCore.container),
      ...this.cards.map((card) => card.container),
      ...this.bullets.map((bullet) => bullet.container),
      ...this.sidewinders.map((missile) => missile.container)
    ];

    if (targets.length === 0) {
      return;
    }

    this.tweens.add({
      targets,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut"
    });
  }

  private createImpactFlash(x: number, y: number, color = 0xfff0a0) {
    const flash = this.add.circle(x, y, 5, color, 0.85);
    flash.setDepth(860);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.9,
      duration: 80,
      onComplete: () => flash.destroy()
    });
  }

  private createBroodCoreDestructionEffect(x: number, y: number, radius: number) {
    const burst = this.add.circle(x, y, Math.max(13, radius * 0.85), this.enemyTheme.fill, 0.74);
    burst.setStrokeStyle(3, this.enemyTheme.flash, 0.8);
    burst.setDepth(880);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 2.5,
      duration: 240,
      ease: "Quad.easeOut",
      onComplete: () => burst.destroy()
    });

    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const chip = this.add.polygon(x, y, "-3 -2 4 0 -2 3", this.enemyTheme.shard, 0.82);
      chip.setDepth(878);
      this.tweens.add({
        targets: chip,
        x: x + Math.cos(angle) * Phaser.Math.FloatBetween(18, 38),
        y: y + Math.sin(angle) * Phaser.Math.FloatBetween(18, 34),
        alpha: 0,
        rotation: Phaser.Math.FloatBetween(-2.2, 2.2),
        duration: Phaser.Math.Between(180, 320),
        ease: "Cubic.easeOut",
        onComplete: () => chip.destroy()
      });
    }
  }

  private createBroodCoreRuptureEffect(x: number, y: number, radius: number) {
    const shockwave = this.add.circle(x, y, Math.max(18, radius * 0.9), this.enemyTheme.fill, 0.28);
    shockwave.setStrokeStyle(4, this.enemyTheme.flash, 0.9);
    shockwave.setDepth(884);
    this.tweens.add({
      targets: shockwave,
      alpha: 0,
      scaleX: 3.4,
      scaleY: 2.2,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => shockwave.destroy()
    });

    for (let index = 0; index < 12; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const shard = this.add.polygon(x, y, "-4 -3 6 0 -3 4", index % 2 === 0 ? this.enemyTheme.shard : this.enemyTheme.dark, 0.86);
      shard.setDepth(882);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * Phaser.Math.FloatBetween(22, 58),
        y: y + Math.sin(angle) * Phaser.Math.FloatBetween(18, 46),
        alpha: 0,
        rotation: Phaser.Math.FloatBetween(-3, 3),
        duration: Phaser.Math.Between(210, 360),
        ease: "Cubic.easeOut",
        onComplete: () => shard.destroy()
      });
    }
  }

  private createBreakthroughFeedback(x: number, y: number, amount: number, heavy = false) {
    const impact = this.add.circle(x, y, heavy ? 17 : 9, this.enemyTheme.fill, heavy ? 0.88 : 0.8);
    impact.setDepth(880);
    this.tweens.add({
      targets: impact,
      alpha: 0,
      scale: heavy ? 3.2 : 2.6,
      duration: heavy ? 230 : 170,
      ease: "Quad.easeOut",
      onComplete: () => impact.destroy()
    });

    const lossText = this.add
      .text(this.player?.container.x ?? x, (this.player?.container.y ?? y) - (heavy ? 62 : 50), `-${amount}`, {
        color: "#ff6d75",
        fontFamily: "Inter, sans-serif",
        fontSize: heavy ? "30px" : "22px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setStroke("#270910", heavy ? 7 : 5)
      .setDepth(980);

    this.tweens.add({
      targets: lossText,
      y: lossText.y - (heavy ? 46 : 34),
      alpha: 0,
      duration: heavy ? 620 : 480,
      ease: "Cubic.easeOut",
      onComplete: () => lossText.destroy()
    });
  }
}
