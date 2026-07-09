import Phaser from "phaser";
import { routeEnemyThemeForFaction, type RouteEnemyTheme } from "../systems/factionTheme";

export type BroodCoreState = "descending" | "ruptureWarning" | "rupturing" | "destroyed";

interface BroodCoreOptions {
  lane: number;
  y: number;
  xOffset: number;
  progress: number;
  theme?: RouteEnemyTheme;
}

export class BroodCore {
  readonly container: Phaser.GameObjects.Container;
  readonly lane: number;
  readonly xOffset: number;
  readonly radius: number;
  readonly maxHealth: number;
  readonly speed: number;
  readonly wobbleSpeed: number;
  readonly wobbleAmount: number;
  readonly seed: number;
  readonly ruptureWarningMs: number;

  health: number;
  y: number;
  state: BroodCoreState = "descending";

  private readonly scene: Phaser.Scene;
  private readonly theme: RouteEnemyTheme;
  private readonly aura: Phaser.GameObjects.Arc;
  private readonly shell: Phaser.GameObjects.Arc;
  private readonly innerGlow: Phaser.GameObjects.Arc;
  private readonly voidCore: Phaser.GameObjects.Arc;
  private readonly pressureEye: Phaser.GameObjects.Arc;
  private readonly hitFlash: Phaser.GameObjects.Arc;
  private readonly crackGraphics: Phaser.GameObjects.Graphics;
  private readonly healthGraphics: Phaser.GameObjects.Graphics;
  private readonly warningRing: Phaser.GameObjects.Arc;
  private warningStartedAt = 0;

  constructor(scene: Phaser.Scene, options: BroodCoreOptions) {
    this.scene = scene;
    this.theme = options.theme ?? routeEnemyThemeForFaction("crimson");
    this.lane = options.lane;
    this.y = options.y;
    this.xOffset = options.xOffset;
    this.radius = Phaser.Math.FloatBetween(27, 34);
    this.maxHealth = Math.round(35 + options.progress * 45);
    this.health = this.maxHealth;
    this.speed = Phaser.Math.FloatBetween(12, 18) + options.progress * 12;
    this.wobbleSpeed = Phaser.Math.FloatBetween(0.55, 0.95);
    this.wobbleAmount = Phaser.Math.FloatBetween(3, 7);
    this.seed = Phaser.Math.FloatBetween(0, 1000);
    this.ruptureWarningMs = Phaser.Math.Between(950, 1350);

    this.container = scene.add.container(0, this.y);
    this.aura = scene.add.circle(0, 0, this.radius * 1.72, this.theme.glow, 0.2);
    this.warningRing = scene.add.circle(0, 0, this.radius * 1.34, this.theme.fill, 0);
    this.shell = scene.add.circle(0, 0, this.radius, this.theme.dark, 0.98);
    this.shell.setStrokeStyle(3.2, this.theme.stroke, 0.96);
    this.innerGlow = scene.add.circle(-this.radius * 0.12, -this.radius * 0.08, this.radius * 0.62, this.theme.core, 0.76);
    this.innerGlow.setStrokeStyle(2, this.theme.flash, 0.82);
    this.voidCore = scene.add.circle(this.radius * 0.16, this.radius * 0.16, this.radius * 0.28, 0x180611, 0.82);
    this.pressureEye = scene.add.circle(-this.radius * 0.32, -this.radius * 0.34, this.radius * 0.13, this.theme.flash, 0.86);
    this.hitFlash = scene.add.circle(0, 0, this.radius * 1.18, this.theme.flash, 0);
    this.crackGraphics = scene.add.graphics();
    this.healthGraphics = scene.add.graphics();

    this.container.add([
      this.aura,
      this.warningRing,
      this.shell,
      this.innerGlow,
      this.voidCore,
      this.pressureEye,
      this.crackGraphics,
      this.healthGraphics,
      this.hitFlash
    ]);
    this.container.setSize(this.radius * 2.8, this.radius * 2.8);
    this.updateDamageVisuals(0);
  }

  update(timeMs: number, ruptureY: number) {
    if (this.state === "descending" && this.y >= ruptureY) {
      this.y = ruptureY;
      this.state = "ruptureWarning";
      this.warningStartedAt = timeMs;
    }

    const warningRatio = this.warningRatio(timeMs);
    const damageRatio = 1 - this.health / this.maxHealth;
    const pulseSpeed = Phaser.Math.Linear(0.004, 0.018, warningRatio);
    const pulse = 0.96 + Math.sin(timeMs * pulseSpeed + this.seed) * Phaser.Math.Linear(0.04, 0.14, warningRatio);
    const instability = damageRatio * 0.5 + warningRatio * 0.9;

    this.aura.setScale(Phaser.Math.Linear(1, 1.34, instability) * pulse);
    this.aura.setAlpha(Phaser.Math.Linear(0.18, 0.44, instability));
    this.warningRing.setAlpha(warningRatio * (0.28 + Math.sin(timeMs * 0.026) * 0.16));
    this.warningRing.setScale(1 + warningRatio * 0.26 + Math.sin(timeMs * 0.02) * warningRatio * 0.12);
    this.innerGlow.setScale(Phaser.Math.Linear(1, 1.22, warningRatio) + Math.sin(timeMs * 0.011 + this.seed) * 0.04);
    this.voidCore.setScale(Phaser.Math.Linear(1, 0.72, warningRatio) + Math.sin(timeMs * 0.014) * 0.035);
    this.pressureEye.setAlpha(Phaser.Math.Linear(0.78, 1, warningRatio) + Math.sin(timeMs * 0.018) * 0.08);
    this.container.angle = Math.sin(timeMs * 0.022 + this.seed) * warningRatio * 2.2;

    this.updateDamageVisuals(warningRatio);
  }

  hit(damage: number, timeMs: number) {
    if (!this.canBeHit()) {
      return;
    }

    this.health = Math.max(0, this.health - damage);
    this.updateDamageVisuals(this.warningRatio(timeMs));
    this.scene.tweens.killTweensOf(this.hitFlash);
    this.hitFlash.setAlpha(0.66);
    this.hitFlash.setScale(0.72);
    this.scene.tweens.add({
      targets: this.hitFlash,
      alpha: 0,
      scale: 1.55,
      duration: 120,
      ease: "Quad.easeOut"
    });
  }

  canBeHit() {
    return this.state === "descending" || this.state === "ruptureWarning";
  }

  shouldRupture(timeMs: number) {
    return this.state === "ruptureWarning" && timeMs - this.warningStartedAt >= this.ruptureWarningMs;
  }

  markRupturing() {
    this.state = "rupturing";
  }

  markDestroyed() {
    this.state = "destroyed";
  }

  destroy() {
    this.container.destroy();
  }

  private warningRatio(timeMs: number) {
    if (this.state !== "ruptureWarning") {
      return 0;
    }
    return Phaser.Math.Clamp((timeMs - this.warningStartedAt) / this.ruptureWarningMs, 0, 1);
  }

  private updateDamageVisuals(warningRatio: number) {
    const healthRatio = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1);
    const damageRatio = 1 - healthRatio;
    const crackAlpha = 0.36 + damageRatio * 0.42 + warningRatio * 0.28;

    this.shell.setFillStyle(this.lerpColor(this.theme.dark, 0x120810, damageRatio), 0.98);
    this.innerGlow.setFillStyle(this.lerpColor(this.theme.core, this.theme.fill, Math.max(damageRatio, warningRatio)), 0.86);
    this.warningRing.setStrokeStyle(3 + warningRatio * 3, this.theme.stroke, warningRatio * 0.78);

    this.crackGraphics.clear();
    this.crackGraphics.lineStyle(2, this.theme.flash, crackAlpha);
    const crackCount = Math.floor(damageRatio * 7 + warningRatio * 5);
    for (let index = 0; index < crackCount; index += 1) {
      const angle = index * 2.03 + this.seed * 0.01;
      const inner = this.radius * Phaser.Math.Linear(0.18, 0.44, (index % 3) / 2);
      const outer = this.radius * Phaser.Math.Linear(0.56, 0.93, ((index + 1) % 4) / 3);
      this.crackGraphics.beginPath();
      this.crackGraphics.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      this.crackGraphics.lineTo(Math.cos(angle + 0.14) * outer, Math.sin(angle + 0.14) * outer);
      this.crackGraphics.strokePath();
    }

    this.healthGraphics.clear();
    this.healthGraphics.lineStyle(3, 0x210812, 0.76);
    this.healthGraphics.beginPath();
    this.healthGraphics.arc(0, -this.radius * 1.24, this.radius * 0.72, Math.PI, 0, false);
    this.healthGraphics.strokePath();
    this.healthGraphics.lineStyle(3, warningRatio > 0 ? this.theme.stroke : this.theme.flash, 0.88);
    this.healthGraphics.beginPath();
    this.healthGraphics.arc(0, -this.radius * 1.24, this.radius * 0.72, Math.PI, Math.PI + Math.PI * healthRatio, false);
    this.healthGraphics.strokePath();
  }

  private lerpColor(from: number, to: number, amount: number) {
    const clamped = Phaser.Math.Clamp(amount, 0, 1);
    const fromColor = Phaser.Display.Color.ValueToColor(from);
    const toColor = Phaser.Display.Color.ValueToColor(to);
    return Phaser.Display.Color.GetColor(
      Math.round(Phaser.Math.Linear(fromColor.red, toColor.red, clamped)),
      Math.round(Phaser.Math.Linear(fromColor.green, toColor.green, clamped)),
      Math.round(Phaser.Math.Linear(fromColor.blue, toColor.blue, clamped))
    );
  }
}
