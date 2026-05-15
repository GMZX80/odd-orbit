import Phaser from "phaser";
import { factionThemes } from "../systems/factionTheme";
import type { StarSystem, StrategicArrivalEffect } from "../systems/galaxyTypes";

interface SwarmStabilisationEffectOptions {
  scene: Phaser.Scene;
  origin: StarSystem;
  destination: StarSystem;
  effect: StrategicArrivalEffect;
  onComplete?: () => void;
}

const playerBlue = 0x38bdf8;
const stableBlue = 0x8ee7ff;
const portalPurple = 0x9b6dff;
const portalCyan = 0x66f2ff;
const portalOpenDelayMs = 960;
const arrivalStreamMs = 2350;
const arrivalSettleMs = 720;

export function playSwarmStabilisationEffect(options: SwarmStabilisationEffectOptions) {
  const { scene, origin, destination, effect, onComplete } = options;
  const destinationPoint = new Phaser.Math.Vector2(destination.x, destination.y);
  const arrivalPoint = new Phaser.Math.Vector2(
    Phaser.Math.Clamp(destination.x + (destination.x < 210 ? 38 : -38), 54, 336),
    Phaser.Math.Clamp(destination.y - 42, 84, 520)
  );
  const successfulArrival = effect.destinationOwnerAfter === "player" && effect.convertedStrategicUnits > 0 && effect.outcome !== "failed";
  const previousPalette = factionThemes[effect.destinationOwnerBefore];
  const playerPalette = factionThemes.player;
  const overlay = scene.add.container(0, 0).setDepth(1400);
  const densityScale = Phaser.Math.Clamp(effect.rawRunnerSpheres / 600, 0.45, 1.9);
  const visibleArrivalSpheres = Math.min(effect.rawRunnerSpheres, successfulArrival ? 180 : 18);
  const visibleSettledUnits = Math.min(effect.convertedStrategicUnits, 34);
  const camera = scene.cameras.main;
  const startZoom = camera.zoom;

  focusCamera(scene, destinationPoint, startZoom);

  const routePulse = scene.add.line(0, 0, origin.x, origin.y, destination.x, destination.y, playerBlue, 0.2);
  routePulse.setOrigin(0, 0).setLineWidth(4 + densityScale * 1.8);
  overlay.add(routePulse);
  scene.tweens.add({
    targets: routePulse,
    alpha: successfulArrival ? 0.44 : 0.16,
    yoyo: true,
    repeat: successfulArrival ? 4 : 0,
    duration: 420,
    ease: "Sine.easeInOut"
  });

  const sectorOverlay = createSectorOverlay(scene, overlay, destinationPoint, previousPalette.mapFill, previousPalette.mapStroke, effect.defenderUnitsBefore);
  const playerBody = scene.add.circle(destinationPoint.x, destinationPoint.y, 15, playerPalette.mapFill, 0);
  playerBody.setStrokeStyle(3, playerPalette.mapStroke, 0);
  overlay.addAt(playerBody, 1);

  const portal = createArrivalPortal(scene, overlay, arrivalPoint, successfulArrival);
  scene.time.delayedCall(successfulArrival ? portalOpenDelayMs : 480, () => {
    if (successfulArrival) {
      beginSuccessfulArrival(scene, overlay, portal, sectorOverlay, playerBody, destinationPoint, effect, visibleArrivalSpheres, visibleSettledUnits, densityScale);
      return;
    }
    beginFailedArrival(scene, overlay, portal, arrivalPoint, destinationPoint, visibleArrivalSpheres);
  });

  const totalDuration = successfulArrival ? 4800 : 1900;
  scene.time.delayedCall(totalDuration, () => {
    camera.pan(195, 360, 360, "Sine.easeInOut");
    camera.zoomTo(startZoom, 360, "Sine.easeInOut");
    scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        overlay.destroy();
        onComplete?.();
      }
    });
  });
}

function focusCamera(scene: Phaser.Scene, point: Phaser.Math.Vector2, startZoom: number) {
  const camera = scene.cameras.main;
  const focusX = Phaser.Math.Clamp(point.x, 96, 294);
  const focusY = Phaser.Math.Clamp(point.y, 150, 468);
  camera.pan(focusX, focusY, 760, "Sine.easeInOut");
  camera.zoomTo(Math.max(startZoom, 1.2), 760, "Sine.easeInOut");
}

function createSectorOverlay(
  scene: Phaser.Scene,
  overlay: Phaser.GameObjects.Container,
  point: Phaser.Math.Vector2,
  fill: number,
  stroke: number,
  initialUnits: number
) {
  const shield = scene.add.circle(point.x, point.y, 31, fill, 0.22);
  shield.setStrokeStyle(4, stroke, 0.68);
  const oldBody = scene.add.circle(point.x, point.y, 15, fill, 0.96);
  oldBody.setStrokeStyle(3, stroke, 0.98);
  const countText = scene.add
    .text(point.x, point.y - 2, String(initialUnits), {
      color: "#06111e",
      fontFamily: "Inter, sans-serif",
      fontSize: "12px",
      fontStyle: "900"
    })
    .setOrigin(0.5);

  overlay.add([shield, oldBody, countText]);
  return { shield, oldBody, countText };
}

function createArrivalPortal(scene: Phaser.Scene, overlay: Phaser.GameObjects.Container, point: Phaser.Math.Vector2, successfulArrival: boolean) {
  const portal = scene.add.container(point.x, point.y);
  const aura = scene.add.circle(0, 0, successfulArrival ? 28 : 20, portalPurple, successfulArrival ? 0.2 : 0.12);
  const ringA = scene.add.circle(0, 0, successfulArrival ? 21 : 16, portalCyan, 0.06);
  ringA.setStrokeStyle(4, portalCyan, successfulArrival ? 0.84 : 0.46);
  const ringB = scene.add.circle(0, 0, successfulArrival ? 14 : 11, portalPurple, 0.04);
  ringB.setStrokeStyle(3, portalPurple, successfulArrival ? 0.75 : 0.42);
  const core = scene.add.circle(0, 0, successfulArrival ? 8 : 5, 0x07131d, 0.82);
  const glint = scene.add.circle(-4, -5, 2.5, 0xffffff, successfulArrival ? 0.74 : 0.42);
  portal.add([aura, ringA, ringB, core, glint]);
  portal.setScale(0.04);
  portal.setAlpha(0);
  overlay.add(portal);

  scene.tweens.add({ targets: portal, alpha: 1, scale: successfulArrival ? 1.18 : 0.9, duration: successfulArrival ? 920 : 360, ease: "Sine.easeOut" });
  scene.tweens.add({ targets: ringA, angle: 360, repeat: -1, duration: successfulArrival ? 1500 : 980, ease: "Linear" });
  scene.tweens.add({ targets: ringB, angle: -360, repeat: -1, duration: successfulArrival ? 1960 : 1280, ease: "Linear" });
  scene.tweens.add({
    targets: aura,
    alpha: successfulArrival ? 0.54 : 0.2,
    scale: successfulArrival ? 1.55 : 1.12,
    yoyo: true,
    repeat: -1,
    duration: successfulArrival ? 620 : 360,
    ease: "Sine.easeInOut"
  });

  return portal;
}

function beginSuccessfulArrival(
  scene: Phaser.Scene,
  overlay: Phaser.GameObjects.Container,
  portal: Phaser.GameObjects.Container,
  sectorOverlay: ReturnType<typeof createSectorOverlay>,
  playerBody: Phaser.GameObjects.Arc,
  destinationPoint: Phaser.Math.Vector2,
  effect: StrategicArrivalEffect,
  visibleArrivalSpheres: number,
  visibleSettledUnits: number,
  densityScale: number
) {
  let absorbedParticles = 0;
  const particleCountForRatio = Math.max(1, visibleArrivalSpheres);
  const updateCountFromAbsorption = () => {
    const absorbedRatio = Phaser.Math.Clamp(absorbedParticles / particleCountForRatio, 0, 1);
    const stabilisedCount = Math.min(effect.convertedStrategicUnits, Math.round(effect.convertedStrategicUnits * absorbedRatio));
    sectorOverlay.countText.setText(String(stabilisedCount));
  };

  sectorOverlay.countText.setText("0");
  scene.tweens.add({ targets: sectorOverlay.oldBody, alpha: 0, scale: 1.4, delay: 220, duration: 760, ease: "Quad.easeOut" });
  scene.tweens.add({ targets: sectorOverlay.shield, alpha: 0.1, scale: 1.68, delay: 180, duration: 820, ease: "Quad.easeOut" });
  scene.tweens.add({ targets: playerBody, alpha: 0.96, delay: 560, duration: 780, ease: "Sine.easeOut" });

  for (let index = 0; index < visibleArrivalSpheres; index += 1) {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const startRadius = Phaser.Math.FloatBetween(2, 22 + densityScale * 10);
    const particle = scene.add.circle(
      portal.x + Math.cos(angle) * startRadius,
      portal.y + Math.sin(angle) * startRadius,
      Phaser.Math.FloatBetween(1.4, 3.1),
      playerBlue,
      Phaser.Math.FloatBetween(0.48, 0.92)
    );
    overlay.add(particle);
    const targetAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const targetRadius = Phaser.Math.FloatBetween(0, 12 + densityScale * 3);
    const delay = Math.round((index / particleCountForRatio) * arrivalStreamMs + Phaser.Math.Between(-80, 120));
    const duration = Phaser.Math.Between(820, 1280);
    scene.tweens.add({
      targets: particle,
      x: destinationPoint.x + Math.cos(targetAngle) * targetRadius,
      y: destinationPoint.y + Math.sin(targetAngle) * targetRadius * 0.74,
      alpha: 0,
      scale: 0.28,
      delay: Math.max(0, delay),
      duration,
      ease: "Cubic.easeIn",
      onComplete: () => {
        absorbedParticles += 1;
        updateCountFromAbsorption();
        pulseAbsorption(scene, overlay, destinationPoint, stableBlue);
        particle.destroy();
      }
    });
  }

  for (let index = 0; index < visibleSettledUnits; index += 1) {
    const angle = (index / Math.max(1, visibleSettledUnits)) * Math.PI * 2;
    const orbitRadius = 18 + Math.sqrt(Math.max(1, visibleSettledUnits)) * 1.4 + (index % 4) * 1.2;
    const stableUnit = scene.add.circle(portal.x, portal.y, Phaser.Math.FloatBetween(3.5, 5.2), stableBlue, 0);
    stableUnit.setStrokeStyle(1.3, 0xffffff, 0.68);
    overlay.add(stableUnit);
    scene.tweens.add({
      targets: stableUnit,
      x: destinationPoint.x + Math.cos(angle) * orbitRadius,
      y: destinationPoint.y + Math.sin(angle) * orbitRadius * 0.7,
      alpha: 0.82,
      delay: 1380 + Math.round((index / Math.max(1, visibleSettledUnits)) * 980) + Phaser.Math.Between(0, 180),
      duration: arrivalSettleMs,
      ease: "Back.easeOut"
    });
  }

  scene.time.delayedCall(arrivalStreamMs + 1260, () => {
    sectorOverlay.countText.setText(String(effect.convertedStrategicUnits));
    pulseDestination(scene, overlay, destinationPoint, stableBlue, 4, 1080);
  });
  scene.tweens.add({ targets: portal, alpha: 0, scale: 0.35, delay: arrivalStreamMs + 1480, duration: 520, ease: "Quad.easeIn" });
}

function beginFailedArrival(
  scene: Phaser.Scene,
  overlay: Phaser.GameObjects.Container,
  portal: Phaser.GameObjects.Container,
  arrivalPoint: Phaser.Math.Vector2,
  destinationPoint: Phaser.Math.Vector2,
  visibleArrivalSpheres: number
) {
  scene.tweens.add({ targets: portal, alpha: 0, scale: 1.45, delay: 420, duration: 420, ease: "Quad.easeOut" });
  for (let index = 0; index < Math.max(6, visibleArrivalSpheres); index += 1) {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const particle = scene.add.circle(arrivalPoint.x, arrivalPoint.y, Phaser.Math.FloatBetween(1.4, 2.5), playerBlue, 0.62);
    overlay.add(particle);
    scene.tweens.add({
      targets: particle,
      x: destinationPoint.x + Math.cos(angle) * Phaser.Math.FloatBetween(34, 62),
      y: destinationPoint.y + Math.sin(angle) * Phaser.Math.FloatBetween(24, 52),
      alpha: 0,
      scale: 0.25,
      delay: Phaser.Math.Between(0, 260),
      duration: Phaser.Math.Between(420, 720),
      ease: "Quad.easeOut",
      onComplete: () => particle.destroy()
    });
  }
  pulseDestination(scene, overlay, destinationPoint, 0xff6d75, 2, 520);
}

function pulseAbsorption(scene: Phaser.Scene, overlay: Phaser.GameObjects.Container, point: Phaser.Math.Vector2, color: number) {
  if (Phaser.Math.Between(0, 2) !== 0) {
    return;
  }

  const spark = scene.add.circle(point.x, point.y, 5, color, 0.3);
  overlay.add(spark);
  scene.tweens.add({
    targets: spark,
    alpha: 0,
    scale: 2,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => spark.destroy()
  });
}

function pulseDestination(
  scene: Phaser.Scene,
  overlay: Phaser.GameObjects.Container,
  point: Phaser.Math.Vector2,
  color: number,
  count: number,
  duration: number
) {
  for (let index = 0; index < count; index += 1) {
    const ring = scene.add.circle(point.x, point.y, 19, color, 0.16);
    ring.setStrokeStyle(3, color, 0.72);
    overlay.add(ring);
    scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 2.2 + index * 0.38,
      delay: 120 * index,
      duration,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy()
    });
  }
}
