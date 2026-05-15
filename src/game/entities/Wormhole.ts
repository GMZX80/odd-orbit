import Phaser from "phaser";
import { wormholeAbsorptionCapForUnits } from "../systems/firepower";

export type WormholeState = "dormant" | "charging" | "unstable" | "open" | "descending" | "teleporting";

const maxWormholeEnergy = 420;
const energyPerHit = 0.12;
const energyDecayPerSecond = 18;
const decayDelayAfterHitMs = 600;
const openingDurationMs = 720;
const maxWormholeIdleParticles = 20;
const maxIdleFlickers = 5;

const stateColors: Record<WormholeState, { glow: number; core: number; ring: number; accent: number }> = {
  dormant: { glow: 0x6143c8, core: 0x171032, ring: 0x635d95, accent: 0x8ddcff },
  charging: { glow: 0x4aa6ff, core: 0x112957, ring: 0x8ddcff, accent: 0xb3fff3 },
  unstable: { glow: 0xbf64ff, core: 0x341457, ring: 0xff8df4, accent: 0x8df6ff },
  open: { glow: 0x65ffcb, core: 0x103f54, ring: 0xffffff, accent: 0xa8fff1 },
  descending: { glow: 0x65ffcb, core: 0x103f54, ring: 0xffffff, accent: 0xa8fff1 },
  teleporting: { glow: 0xffffff, core: 0x103f54, ring: 0xffffff, accent: 0xc4fff8 }
};

interface WormholeParticle {
  body: Phaser.GameObjects.Arc;
  active: boolean;
  angle: number;
  radius: number;
  speed: number;
  drift: number;
  lifeMs: number;
  maxLifeMs: number;
  baseAlpha: number;
  size: number;
}

interface WormholeFlicker {
  body: Phaser.GameObjects.Graphics;
  active: boolean;
  angle: number;
  radius: number;
  lifeMs: number;
  maxLifeMs: number;
  width: number;
}

export class Wormhole {
  readonly container: Phaser.GameObjects.Container;
  readonly lane: number;
  readonly maxEnergy = maxWormholeEnergy;
  readonly hitRadius = 38;
  state: WormholeState = "dormant";
  energy = 0;
  y: number;

  private readonly scene: Phaser.Scene;
  private readonly aura: Phaser.GameObjects.Graphics;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly shield: Phaser.GameObjects.Arc;
  private readonly hitFlash: Phaser.GameObjects.Arc;
  private readonly outerDistortion: Phaser.GameObjects.Graphics;
  private readonly backSwirl: Phaser.GameObjects.Graphics;
  private readonly swirl: Phaser.GameObjects.Graphics;
  private readonly tunnelRings: Phaser.GameObjects.Graphics;
  private readonly progressRing: Phaser.GameObjects.Graphics;
  private readonly idleParticles: WormholeParticle[];
  private readonly flickers: WormholeFlicker[];
  private stateAgeMs = 0;
  private lastHitAtMs = -Number.MAX_SAFE_INTEGER;
  private absorbedEnergyThisSecond = 0;
  private energyWindowStartedAtMs = 0;
  private particleSpawnTimerMs = 80;
  private flickerTimerMs = 900;

  constructor(scene: Phaser.Scene, lane: number, y: number) {
    this.scene = scene;
    this.lane = lane;
    this.y = y;
    this.container = scene.add.container(0, y);
    this.aura = scene.add.graphics();
    this.outerDistortion = scene.add.graphics();
    this.tunnelRings = scene.add.graphics();
    this.backSwirl = scene.add.graphics();
    this.swirl = scene.add.graphics();
    this.ring = scene.add.circle(0, 0, 37, 0x171032, 0.16);
    this.core = scene.add.circle(0, 0, 18, 0x050817, 0.72);
    this.shield = scene.add.circle(0, 0, 49, 0x000000, 0);
    this.progressRing = scene.add.graphics();
    this.hitFlash = scene.add.circle(0, 0, 30, 0xffffff, 0);
    this.idleParticles = this.createIdleParticles();
    this.flickers = this.createFlickers();
    this.container.add([
      this.aura,
      this.outerDistortion,
      this.tunnelRings,
      ...this.idleParticles.map((particle) => particle.body),
      this.backSwirl,
      this.swirl,
      this.ring,
      this.core,
      this.shield,
      this.progressRing,
      ...this.flickers.map((flicker) => flicker.body),
      this.hitFlash
    ]);
    this.container.setSize(108, 108);
    this.updateVisuals(0, 0);
  }

  update(timeMs: number, deltaSeconds: number) {
    this.stateAgeMs += deltaSeconds * 1000;

    if (this.canBeHit() && timeMs - this.lastHitAtMs > decayDelayAfterHitMs) {
      this.setEnergy(this.energy - energyDecayPerSecond * deltaSeconds);
    }

    if (this.state === "open" && this.stateAgeMs >= openingDurationMs) {
      this.setState("descending");
    }

    this.updateVisuals(timeMs, deltaSeconds);
  }

  canBeHit() {
    return this.state === "dormant" || this.state === "charging" || this.state === "unstable";
  }

  hit(timeMs: number, playerUnits = 1) {
    if (!this.canBeHit()) {
      return;
    }

    this.lastHitAtMs = timeMs;
    if (timeMs - this.energyWindowStartedAtMs >= 1000) {
      this.energyWindowStartedAtMs = timeMs;
      this.absorbedEnergyThisSecond = 0;
    }

    const maxEnergyAbsorbedPerSecond = wormholeAbsorptionCapForUnits(playerUnits);
    const remainingAbsorption = Math.max(0, maxEnergyAbsorbedPerSecond - this.absorbedEnergyThisSecond);
    const absorbedEnergy = Math.min(energyPerHit, remainingAbsorption);
    this.absorbedEnergyThisSecond += absorbedEnergy;
    this.setEnergy(this.energy + absorbedEnergy);
    this.playHitPulse();
  }

  startTeleporting() {
    this.setState("teleporting");
  }

  destroy() {
    this.container.destroy();
  }

  private chargeProgress() {
    return Phaser.Math.Clamp(this.energy / this.maxEnergy, 0, 1);
  }

  private setEnergy(energy: number) {
    this.energy = Phaser.Math.Clamp(energy, 0, this.maxEnergy);

    if (this.energy >= this.maxEnergy) {
      this.setState("open");
    } else if (this.energy >= this.maxEnergy * 0.52) {
      this.setState("unstable");
    } else if (this.energy > 0.5) {
      this.setState("charging");
    } else {
      this.setState("dormant");
    }
  }

  private setState(state: WormholeState) {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.stateAgeMs = 0;

    if (state === "open") {
      this.scene.tweens.add({
        targets: this.container,
        scaleX: this.container.scaleX * 1.16,
        scaleY: this.container.scaleY * 1.16,
        duration: 180,
        yoyo: true,
        ease: "Sine.easeOut"
      });
    }
  }

  private updateVisuals(timeMs: number, deltaSeconds: number) {
    const palette = stateColors[this.state];
    const progress = this.chargeProgress();
    const openPower = this.state === "open" || this.state === "descending" || this.state === "teleporting" ? 1 : progress;
    const pulseSpeed = Phaser.Math.Linear(0.0028, 0.0085, openPower);
    const pulse = 0.5 + Math.sin(timeMs * pulseSpeed) * 0.5;
    const pulseAmount = Phaser.Math.Linear(0.05, 0.2, openPower);
    const frontSpin = Phaser.Math.Linear(0.28, 1.75, openPower) * deltaSeconds;
    const backSpin = Phaser.Math.Linear(0.16, 1.1, openPower) * deltaSeconds;
    const distortionSpin = Phaser.Math.Linear(0.08, 0.42, openPower) * deltaSeconds;

    this.drawIrregularAura(palette, progress, pulse, timeMs);
    this.ring.setFillStyle(palette.core, 0.12 + openPower * 0.12);
    this.ring.setStrokeStyle(1.2 + openPower * 1.6, palette.ring, 0.18 + openPower * 0.34);
    this.core.setFillStyle(palette.core, 0.48 + openPower * 0.28);
    this.core.setScale(0.82 + openPower * 0.42 + pulse * pulseAmount);
    this.shield.setStrokeStyle(this.state === "dormant" ? 2 : 1, palette.accent, this.state === "open" ? 0 : Phaser.Math.Linear(0.16, 0.36, progress));
    this.outerDistortion.rotation += distortionSpin;
    this.tunnelRings.rotation -= distortionSpin * 0.6;
    this.backSwirl.rotation -= backSpin;
    this.swirl.rotation += frontSpin;

    this.drawOuterDistortion(palette, progress, pulse, timeMs);
    this.drawTunnelCue(palette, progress, pulse, timeMs);
    this.drawSwirl(palette, progress, pulse);
    this.drawProgress(palette, progress);
    this.updateIdleParticles(deltaSeconds, progress);
    this.updateFlickers(deltaSeconds, progress, palette);
  }

  private drawIrregularAura(
    palette: { glow: number; core: number; ring: number; accent: number },
    progress: number,
    pulse: number,
    timeMs: number
  ) {
    this.aura.clear();
    const openPower = this.state === "open" || this.state === "descending" || this.state === "teleporting" ? 1 : progress;
    const breathing = Phaser.Math.Linear(0.88, 1.18, openPower) + pulse * Phaser.Math.Linear(0.04, 0.16, openPower);
    const baseAlpha = Phaser.Math.Linear(0.08, 0.26, openPower);

    for (let index = 0; index < 7; index += 1) {
      const phase = timeMs * (0.0011 + index * 0.00017) + index * 1.41;
      const offsetX = Math.cos(phase) * (4 + (index % 3) * 3);
      const offsetY = Math.sin(phase * 0.83) * (3 + (index % 2) * 4);
      const width = (78 + (index % 4) * 10 + Math.sin(phase * 1.7) * 9) * breathing;
      const height = (54 + (index % 5) * 8 + Math.cos(phase * 1.23) * 7) * breathing;
      this.aura.fillStyle(index % 2 === 0 ? palette.glow : palette.accent, baseAlpha * (0.45 + index * 0.055));
      this.aura.fillEllipse(offsetX, offsetY, width, height);
    }

    for (let index = 0; index < 5; index += 1) {
      const angle = timeMs * 0.00055 + index * 1.26;
      const radius = 38 + Math.sin(timeMs * 0.001 + index) * 6;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle * 1.17) * radius * 0.7;
      this.aura.fillStyle(palette.ring, 0.06 + progress * 0.09);
      this.aura.fillEllipse(x, y, 16 + progress * 10, 8 + progress * 6);
    }
  }

  private drawSwirl(palette: { glow: number; core: number; ring: number; accent: number }, progress: number, pulse: number) {
    this.backSwirl.clear();
    this.swirl.clear();

    for (let index = 0; index < 5; index += 1) {
      const radius = 18 + index * 7 + pulse * (1.5 + progress * 2.4);
      const start = index * 1.26 + progress * 1.15;
      const end = start + 0.48 + progress * 0.75;
      this.backSwirl.lineStyle(2.4 - index * 0.2, index % 2 === 0 ? palette.glow : palette.accent, 0.18 + progress * 0.28);
      this.backSwirl.beginPath();
      this.backSwirl.arc(0, 0, radius, start, end, false);
      this.backSwirl.strokePath();
    }

    for (let index = 0; index < 4; index += 1) {
      const radius = 13 + index * 7 + pulse * (1.4 + progress * 2.3);
      const start = index * 1.42 + progress * 1.2;
      const end = start + 0.68 + progress * 0.92;
      this.swirl.lineStyle(2.8 - index * 0.24, index % 2 === 0 ? palette.ring : palette.glow, 0.28 + progress * 0.48);
      this.swirl.beginPath();
      this.swirl.arc(0, 0, radius, start, end, false);
      this.swirl.strokePath();
    }
  }

  private drawProgress(palette: { glow: number; core: number; ring: number; accent: number }, progress: number) {
    this.progressRing.clear();
    this.progressRing.lineStyle(3, 0x34435f, 0.26);
    for (let index = 0; index < 10; index += 1) {
      const start = -Math.PI / 2 + index * 0.63;
      this.progressRing.beginPath();
      this.progressRing.arc(0, 0, 48 + (index % 2), start, start + 0.34, false);
      this.progressRing.strokePath();
    }

    this.progressRing.lineStyle(this.state === "open" || this.state === "descending" || this.state === "teleporting" ? 6 : 5, palette.accent, 0.9);
    this.progressRing.beginPath();
    this.progressRing.arc(0, 0, 47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
    this.progressRing.strokePath();
  }

  private drawOuterDistortion(palette: { glow: number; core: number; ring: number; accent: number }, progress: number, pulse: number, timeMs: number) {
    this.outerDistortion.clear();
    const wobble = Math.sin(timeMs * 0.0017) * 2.4;

    for (let index = 0; index < 12; index += 1) {
      const radius = 47 + (index % 4) * 5 + wobble + pulse * 3.2;
      const start = index * 0.58 + Math.sin(timeMs * 0.0008 + index) * 0.22;
      const end = start + Phaser.Math.Linear(0.14, 0.46, progress) + (index % 3) * 0.06;
      this.outerDistortion.lineStyle(1.4 + progress * 1.2, index % 2 === 0 ? palette.accent : palette.glow, 0.08 + progress * 0.2);
      this.outerDistortion.beginPath();
      this.outerDistortion.arc(0, 0, radius, start, end, false);
      this.outerDistortion.strokePath();
    }
  }

  private drawTunnelCue(palette: { glow: number; core: number; ring: number; accent: number }, progress: number, pulse: number, timeMs: number) {
    this.tunnelRings.clear();
    const tunnelAlpha = 0.12 + progress * 0.28;
    this.tunnelRings.fillStyle(0x020817, 0.34 + progress * 0.22);
    this.tunnelRings.fillCircle(0, 0, 12 + progress * 4 + pulse * 2);

    for (let index = 0; index < 3; index += 1) {
      const radius = 9 + index * 7 + pulse * 2;
      this.tunnelRings.lineStyle(1.2, palette.ring, tunnelAlpha * (1 - index * 0.2));
      this.tunnelRings.beginPath();
      this.tunnelRings.arc(0, 0, radius, index * 0.7, index * 0.7 + Math.PI * 1.28, false);
      this.tunnelRings.strokePath();
    }

    for (let index = 0; index < 8; index += 1) {
      const angle = index * 0.785 + timeMs * 0.00045;
      const outerRadius = 58 + (index % 3) * 7;
      const innerRadius = 18 + progress * 3;
      this.tunnelRings.lineStyle(1, palette.accent, 0.06 + progress * 0.18);
      this.tunnelRings.lineBetween(
        Math.cos(angle) * outerRadius,
        Math.sin(angle) * outerRadius,
        Math.cos(angle + 0.22) * innerRadius,
        Math.sin(angle + 0.22) * innerRadius
      );
    }
  }

  private createIdleParticles(): WormholeParticle[] {
    return Array.from({ length: maxWormholeIdleParticles }, () => {
      const body = this.scene.add.circle(0, 0, 1.8, 0xbffcff, 0);
      body.setVisible(false);
      return {
        body,
        active: false,
        angle: 0,
        radius: 0,
        speed: 0,
        drift: 0,
        lifeMs: 0,
        maxLifeMs: 1,
        baseAlpha: 0,
        size: 1
      };
    });
  }

  private updateIdleParticles(deltaSeconds: number, progress: number) {
    this.particleSpawnTimerMs -= deltaSeconds * 1000;
    if (this.particleSpawnTimerMs <= 0) {
      this.spawnIdleParticle(progress);
      this.particleSpawnTimerMs = Phaser.Math.FloatBetween(Phaser.Math.Linear(260, 85, progress), Phaser.Math.Linear(460, 155, progress));
    }

    for (const particle of this.idleParticles) {
      if (!particle.active) {
        continue;
      }

      particle.lifeMs -= deltaSeconds * 1000;
      particle.radius -= particle.speed * deltaSeconds * (1 + progress * 0.72);
      particle.angle += particle.drift * deltaSeconds * (1.1 + progress * 0.7);

      if (particle.lifeMs <= 0 || particle.radius <= 7) {
        particle.active = false;
        particle.body.setVisible(false);
        continue;
      }

      const lifeRatio = Phaser.Math.Clamp(particle.lifeMs / particle.maxLifeMs, 0, 1);
      particle.body.setPosition(Math.cos(particle.angle) * particle.radius, Math.sin(particle.angle) * particle.radius);
      particle.body.setAlpha(particle.baseAlpha * lifeRatio);
      particle.body.setScale(Phaser.Math.Linear(0.55, particle.size, lifeRatio));
    }
  }

  private spawnIdleParticle(progress: number) {
    const particle = this.idleParticles.find((candidate) => !candidate.active);
    if (!particle) {
      return;
    }

    particle.active = true;
    particle.angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    particle.radius = Phaser.Math.FloatBetween(64, 108);
    particle.speed = Phaser.Math.FloatBetween(30, 56) + progress * 58;
    particle.drift = Phaser.Math.FloatBetween(-1.2, 1.2);
    particle.maxLifeMs = Phaser.Math.FloatBetween(850, 1400);
    particle.lifeMs = particle.maxLifeMs;
    particle.baseAlpha = Phaser.Math.FloatBetween(0.36, 0.68 + progress * 0.22);
    particle.size = Phaser.Math.FloatBetween(0.85, 1.55 + progress * 0.55);
    particle.body.setFillStyle(progress > 0.55 ? 0xd8fff7 : 0xbffcff, 1);
    particle.body.setPosition(Math.cos(particle.angle) * particle.radius, Math.sin(particle.angle) * particle.radius);
    particle.body.setScale(particle.size);
    particle.body.setAlpha(particle.baseAlpha);
    particle.body.setVisible(true);
  }

  private createFlickers(): WormholeFlicker[] {
    return Array.from({ length: maxIdleFlickers }, () => ({
      body: this.scene.add.graphics().setVisible(false),
      active: false,
      angle: 0,
      radius: 0,
      lifeMs: 0,
      maxLifeMs: 1,
      width: 1
    }));
  }

  private updateFlickers(
    deltaSeconds: number,
    progress: number,
    palette: { glow: number; core: number; ring: number; accent: number }
  ) {
    this.flickerTimerMs -= deltaSeconds * 1000;
    if (this.flickerTimerMs <= 0) {
      this.spawnFlicker(progress);
      this.flickerTimerMs = Phaser.Math.FloatBetween(Phaser.Math.Linear(950, 220, progress), Phaser.Math.Linear(1700, 520, progress));
    }

    for (const flicker of this.flickers) {
      if (!flicker.active) {
        continue;
      }

      flicker.lifeMs -= deltaSeconds * 1000;
      const lifeRatio = Phaser.Math.Clamp(flicker.lifeMs / flicker.maxLifeMs, 0, 1);
      flicker.body.clear();

      if (flicker.lifeMs <= 0) {
        flicker.active = false;
        flicker.body.setVisible(false);
        continue;
      }

      const arcLength = 0.14 + progress * 0.18;
      const start = flicker.angle + (1 - lifeRatio) * 0.18;
      flicker.body.lineStyle(flicker.width, palette.accent, lifeRatio * (0.32 + progress * 0.42));
      flicker.body.beginPath();
      flicker.body.arc(0, 0, flicker.radius, start, start + arcLength, false);
      flicker.body.strokePath();

      const sparkX = Math.cos(start + arcLength) * flicker.radius;
      const sparkY = Math.sin(start + arcLength) * flicker.radius;
      flicker.body.fillStyle(palette.ring, lifeRatio * 0.7);
      flicker.body.fillCircle(sparkX, sparkY, 2 + progress * 1.5);
    }
  }

  private spawnFlicker(progress: number) {
    const flicker = this.flickers.find((candidate) => !candidate.active);
    if (!flicker) {
      return;
    }

    flicker.active = true;
    flicker.angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    flicker.radius = Phaser.Math.FloatBetween(42, 68);
    flicker.maxLifeMs = Phaser.Math.FloatBetween(80, 170 + progress * 80);
    flicker.lifeMs = flicker.maxLifeMs;
    flicker.width = Phaser.Math.FloatBetween(1.5, 2.7 + progress * 1.3);
    flicker.body.setVisible(true);
  }

  private playHitPulse() {
    this.scene.tweens.killTweensOf([this.hitFlash, this.aura]);
    this.hitFlash.setAlpha(0.52);
    this.hitFlash.setScale(0.42);
    this.scene.tweens.add({
      targets: this.hitFlash,
      alpha: 0,
      scale: 1.38,
      duration: 120,
      ease: "Quad.easeOut"
    });
  }
}
