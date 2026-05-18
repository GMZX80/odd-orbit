import Phaser from "phaser";
import type { FactionId, StarSystem } from "../systems/galaxyTypes";
import { mapX, mapY } from "./mapLayout";
import { ownerPalette } from "./ownerPalette";

export interface DirectionalAttackAnimationOptions {
  origin: StarSystem;
  destination: StarSystem;
  onComplete: () => void;
  sourceColor?: number;
  beamColor?: number;
  impactColor?: number;
  sourceRadius?: number;
  targetRadius?: number;
}

export interface RouteTransferAnimationOptions {
  origin: StarSystem;
  destination: StarSystem;
  faction: FactionId;
  onComplete: () => void;
}

export interface PulseSystemOptions {
  system: StarSystem;
  color: number;
  onComplete: () => void;
}

export class GalaxyStrategicAnimator {
  constructor(private readonly scene: Phaser.Scene) {}

  playDirectionalAttack(options: DirectionalAttackAnimationOptions) {
    const source = new Phaser.Math.Vector2(mapX(options.origin.x), mapY(options.origin.y));
    const target = new Phaser.Math.Vector2(mapX(options.destination.x), mapY(options.destination.y));
    const delta = target.clone().subtract(source);
    const distance = delta.length();
    if (distance <= 0) {
      this.scene.time.delayedCall(120, options.onComplete);
      return;
    }

    const direction = delta.clone().normalize();
    const angle = Phaser.Math.Angle.Between(source.x, source.y, target.x, target.y);
    const sourceRadius = options.sourceRadius ?? 22;
    const targetRadius = options.targetRadius ?? 23;
    const sourceColor = options.sourceColor ?? 0x28c9ff;
    const beamColor = options.beamColor ?? 0x6eeeff;
    const impactColor = options.impactColor ?? 0xffd45f;
    const overlay = this.scene.add.container(0, 0).setDepth(132);

    this.createSourceChargeEffect(overlay, source, sourceColor, sourceRadius);
    this.scene.time.delayedCall(260, () => {
      this.createAttackTrailEffect(overlay, source, target, angle, beamColor);
      this.createDirectionalArrowParticles(overlay, source, target, angle, beamColor, impactColor);
    });
    this.scene.time.delayedCall(860, () => {
      this.createTargetImpactEffect(overlay, target, direction, impactColor, targetRadius);
    });
    this.scene.time.delayedCall(1120, () => {
      this.pulseTargetAftermath(overlay, target, impactColor, targetRadius);
    });
    this.scene.time.delayedCall(1480, () => {
      overlay.destroy(true);
      options.onComplete();
    });
  }

  animateRouteTransfer(options: RouteTransferAnimationOptions) {
    const color = ownerPalette[options.faction].fill;
    for (let index = 0; index < 7; index += 1) {
      const dot = this.scene.add.circle(mapX(options.origin.x), mapY(options.origin.y), 3.8, color, 0.9).setDepth(120);
      this.scene.tweens.add({
        targets: dot,
        x: mapX(options.destination.x),
        y: mapY(options.destination.y),
        alpha: 0.2,
        delay: index * 70,
        duration: 560,
        ease: "Cubic.easeInOut",
        onComplete: () => dot.destroy()
      });
    }
    this.scene.time.delayedCall(980, options.onComplete);
  }

  pulseSystem(options: PulseSystemOptions) {
    const ring = this.scene.add.circle(mapX(options.system.x), mapY(options.system.y), 22, options.color, 0.18).setStrokeStyle(4, options.color, 0.8).setDepth(120);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 2.1,
      duration: 640,
      ease: "Quad.easeOut",
      onComplete: () => {
        ring.destroy();
        options.onComplete();
      }
    });
  }

  playDeployDrop(system: StarSystem) {
    const token = this.scene.add.circle(mapX(system.x), mapY(system.y) - 34, 5, 0x66f2a8, 0.9).setStrokeStyle(1.5, 0xffffff, 0.72).setDepth(120);
    this.scene.tweens.add({
      targets: token,
      y: mapY(system.y),
      alpha: 0,
      scale: 1.7,
      duration: 360,
      ease: "Cubic.easeIn",
      onComplete: () => token.destroy()
    });
  }

  playInvalidTap(system: StarSystem) {
    const ring = this.scene.add.circle(mapX(system.x), mapY(system.y), 20, 0x9aa8b5, 0.08).setStrokeStyle(2, 0x9aa8b5, 0.45).setDepth(90);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 1.45,
      duration: 180,
      onComplete: () => ring.destroy()
    });
  }

  private createSourceChargeEffect(overlay: Phaser.GameObjects.Container, source: Phaser.Math.Vector2, color: number, radius: number) {
    const core = this.scene.add.circle(source.x, source.y, radius + 6, color, 0.18).setStrokeStyle(2.5, color, 0.75);
    overlay.add(core);
    this.scene.tweens.add({
      targets: core,
      alpha: 0.42,
      scale: 1.18,
      yoyo: true,
      repeat: 1,
      duration: 170,
      ease: "Sine.easeInOut"
    });

    for (let index = 0; index < 3; index += 1) {
      const ring = this.scene.add.circle(source.x, source.y, radius + 2, color, 0.16).setStrokeStyle(2.4, color, 0.84);
      overlay.add(ring);
      this.scene.tweens.add({
        targets: ring,
        alpha: 0,
        scale: 1.9 + index * 0.22,
        delay: index * 95,
        duration: 500,
        ease: "Quad.easeOut",
        onComplete: () => ring.destroy()
      });
    }

    for (let index = 0; index < 18; index += 1) {
      const sparkAngle = (Math.PI * 2 * index) / 18 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const sparkDistance = Phaser.Math.Between(22, 42);
      const spark = this.scene.add.circle(source.x, source.y, Phaser.Math.FloatBetween(1.2, 2.4), 0xd9f7ff, 0.9);
      overlay.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: source.x + Math.cos(sparkAngle) * sparkDistance,
        y: source.y + Math.sin(sparkAngle) * sparkDistance,
        alpha: 0,
        scale: 0.2,
        delay: Phaser.Math.Between(0, 130),
        duration: 380,
        ease: "Cubic.easeOut",
        onComplete: () => spark.destroy()
      });
    }
  }

  private createAttackTrailEffect(
    overlay: Phaser.GameObjects.Container,
    source: Phaser.Math.Vector2,
    target: Phaser.Math.Vector2,
    angle: number,
    color: number
  ) {
    const glow = this.scene.add.line(0, 0, source.x, source.y, target.x, target.y, color, 0.28).setOrigin(0, 0).setLineWidth(9);
    const core = this.scene.add.line(0, 0, source.x, source.y, target.x, target.y, 0xf7fbff, 0.82).setOrigin(0, 0).setLineWidth(2.5);
    const leading = this.scene.add.rectangle(source.x, source.y, 26, 5, 0xf7fbff, 0.9).setRotation(angle);
    overlay.add([glow, core, leading]);

    this.scene.tweens.add({
      targets: [glow, core],
      alpha: 0,
      delay: 460,
      duration: 360,
      ease: "Quad.easeOut",
      onComplete: () => {
        glow.destroy();
        core.destroy();
      }
    });
    this.scene.tweens.add({
      targets: leading,
      x: target.x,
      y: target.y,
      alpha: 0,
      scaleX: 1.6,
      duration: 560,
      ease: "Cubic.easeIn",
      onComplete: () => leading.destroy()
    });
  }

  private createDirectionalArrowParticles(
    overlay: Phaser.GameObjects.Container,
    source: Phaser.Math.Vector2,
    target: Phaser.Math.Vector2,
    angle: number,
    beamColor: number,
    impactColor: number
  ) {
    for (let index = 0; index < 7; index += 1) {
      const startT = 0.06 + index * 0.055;
      const start = this.pointOnAttackPath(source, target, startT);
      const arrow = this.scene.add.triangle(start.x, start.y, 0, -5.5, 18, 0, 0, 5.5, index > 4 ? impactColor : beamColor, 0.92).setRotation(angle);
      overlay.add(arrow);
      this.scene.tweens.add({
        targets: arrow,
        x: target.x,
        y: target.y,
        alpha: 0,
        scale: 1.18,
        delay: index * 52,
        duration: 540,
        ease: "Cubic.easeIn",
        onComplete: () => arrow.destroy()
      });
    }

    for (let index = 0; index < 28; index += 1) {
      const startT = Phaser.Math.FloatBetween(0.02, 0.42);
      const endT = Phaser.Math.FloatBetween(0.72, 1);
      const start = this.pointOnAttackPath(source, target, startT);
      const end = this.pointOnAttackPath(source, target, endT);
      const particle = this.scene.add.circle(start.x, start.y, Phaser.Math.FloatBetween(1, 2.1), index % 5 === 0 ? 0xf7fbff : beamColor, 0.8);
      overlay.add(particle);
      this.scene.tweens.add({
        targets: particle,
        x: end.x,
        y: end.y,
        alpha: 0,
        scale: 0.35,
        delay: Phaser.Math.Between(0, 330),
        duration: Phaser.Math.Between(430, 690),
        ease: "Quad.easeIn",
        onComplete: () => particle.destroy()
      });
    }
  }

  private createTargetImpactEffect(
    overlay: Phaser.GameObjects.Container,
    target: Phaser.Math.Vector2,
    direction: Phaser.Math.Vector2,
    color: number,
    radius: number
  ) {
    const impactPoint = target.clone().subtract(direction.clone().scale(radius - 1));
    const flash = this.scene.add.circle(impactPoint.x, impactPoint.y, 11, 0xf7fbff, 0.98).setStrokeStyle(2.5, color, 0.94);
    overlay.add(flash);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.8,
      duration: 320,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });

    for (let index = 0; index < 3; index += 1) {
      const shockwave = this.scene.add.circle(target.x, target.y, radius + 2, color, 0.12).setStrokeStyle(2.4, color, 0.82);
      overlay.add(shockwave);
      this.scene.tweens.add({
        targets: shockwave,
        alpha: 0,
        scale: 1.65 + index * 0.3,
        delay: index * 85,
        duration: 560,
        ease: "Quad.easeOut",
        onComplete: () => shockwave.destroy()
      });
    }

    const reboundAngle = Phaser.Math.Angle.Between(direction.x, direction.y, 0, 0);
    for (let index = 0; index < 24; index += 1) {
      const spread = Phaser.Math.FloatBetween(-0.9, 0.9);
      const sparkAngle = reboundAngle + spread;
      const sparkDistance = Phaser.Math.Between(16, 52);
      const spark = this.scene.add.circle(impactPoint.x, impactPoint.y, Phaser.Math.FloatBetween(1.2, 2.7), index % 4 === 0 ? 0xf7fbff : color, 0.88);
      overlay.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: impactPoint.x + Math.cos(sparkAngle) * sparkDistance,
        y: impactPoint.y + Math.sin(sparkAngle) * sparkDistance,
        alpha: 0,
        scale: 0.28,
        delay: Phaser.Math.Between(0, 70),
        duration: Phaser.Math.Between(340, 620),
        ease: "Cubic.easeOut",
        onComplete: () => spark.destroy()
      });
    }
  }

  private pulseTargetAftermath(overlay: Phaser.GameObjects.Container, target: Phaser.Math.Vector2, color: number, radius: number) {
    for (let index = 0; index < 2; index += 1) {
      const pulse = this.scene.add.circle(target.x, target.y, radius + 4, color, 0.1).setStrokeStyle(2.2, color, 0.68);
      overlay.add(pulse);
      this.scene.tweens.add({
        targets: pulse,
        alpha: 0,
        scale: 1.45 + index * 0.24,
        delay: index * 110,
        duration: 440,
        ease: "Sine.easeOut",
        onComplete: () => pulse.destroy()
      });
    }
  }

  private pointOnAttackPath(source: Phaser.Math.Vector2, target: Phaser.Math.Vector2, t: number) {
    return new Phaser.Math.Vector2(Phaser.Math.Linear(source.x, target.x, t), Phaser.Math.Linear(source.y, target.y, t));
  }
}
