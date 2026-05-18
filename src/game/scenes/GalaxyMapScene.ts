import Phaser from "phaser";
import { playSwarmStabilisationEffect } from "../effects/SwarmStabilisationEffect";
import { gameEvents } from "../events";
import { GalaxyCommandPanel } from "../galaxy/GalaxyCommandPanel";
import { GalaxyMapRenderer } from "../galaxy/GalaxyMapRenderer";
import { mapX, mapY, toVisualSystem } from "../galaxy/mapLayout";
import { ownerPalette } from "../galaxy/ownerPalette";
import { drawPhaseHud } from "../galaxy/PhaseHud";
import {
  autoResolveStrategicBattle,
  canCreateMoveOrder,
  canFortifyMove,
  commitMoveOrder,
  consumePendingStrategicArrivalEffect,
  deployToSystem,
  executeFortify,
  executeNextNpcTurn,
  finishFortifyPhase,
  finishNpcRound,
  getGalaxySnapshot,
  skipCommand,
  skipDeployment
} from "../systems/galaxyState";
import type { FactionId, GalaxyAction, StarSystem, StrategicArrivalEffect } from "../systems/galaxyTypes";

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;
type DirectionalAttackOptions = {
  sourceColor?: number;
  beamColor?: number;
  impactColor?: number;
  sourceRadius?: number;
  targetRadius?: number;
};

export class GalaxyMapScene extends Phaser.Scene {
  private readonly mapRenderer: GalaxyMapRenderer;
  private readonly commandPanel: GalaxyCommandPanel;
  private selectedSystemId?: string;
  private destinationSystemId?: string;
  private fortifyUnitsToMove?: number;
  private npcProcessing = false;
  private arrivalEffectPlaying = false;
  private strategyAnimationPlaying = false;
  private activeAction?: GalaxyAction;
  private lastIdleRenderAt = 0;

  constructor() {
    super("GalaxyMapScene");
    this.mapRenderer = new GalaxyMapRenderer(this);
    this.commandPanel = new GalaxyCommandPanel(this, this.mapRenderer);
  }

  create() {
    this.cameras.main.setBackgroundColor("#06111e");
    this.resetCamera();
    this.render();
    this.playPendingArrivalEffect();
  }

  update(time: number) {
    if (time - this.lastIdleRenderAt < 140 || !this.shouldRefreshIdleVisuals()) {
      return;
    }

    this.lastIdleRenderAt = time;
    this.render();
  }

  private resetCamera() {
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setZoom(1);
    this.cameras.main.setRotation(0);
    this.cameras.main.setAlpha(1);
  }

  private render() {
    this.children.removeAll(true);
    const snapshot = getGalaxySnapshot();
    const cinematicMode = this.isCinematicMode();
    this.mapRenderer.drawBackground();
    this.mapRenderer.drawConstellations(snapshot.systems, snapshot.constellations, snapshot.turnPhase);
    this.mapRenderer.drawStarlanes({
      systems: snapshot.systems,
      selectedSystemId: this.selectedSystemId,
      destinationSystemId: this.destinationSystemId,
      activeAction: this.activeAction
    });
    this.mapRenderer.drawSystems({
      snapshot,
      selectedSystemId: this.selectedSystemId,
      destinationSystemId: this.destinationSystemId,
      activeAction: this.activeAction,
      arrivalEffectPlaying: this.arrivalEffectPlaying,
      strategyAnimationPlaying: this.strategyAnimationPlaying,
      onSystemClick: (systemId) => this.handleSystemClick(systemId)
    });
    if (!cinematicMode && snapshot.turnPhase === "deploy") {
      this.mapRenderer.drawDeployProductionEffects(snapshot);
    }
    if (cinematicMode) {
      this.mapRenderer.drawCinematicShade();
    } else {
      this.mapRenderer.drawActionBadge({ snapshot, activeAction: this.activeAction, arrivalEffectPlaying: this.arrivalEffectPlaying });
      this.drawCommandPanel(snapshot);
      this.mapRenderer.drawDebugLog(snapshot);
    }
    drawPhaseHud(this, snapshot);
    if (snapshot.turnPhase === "gameOver") {
      this.mapRenderer.drawGameOver(snapshot);
    }
    this.maybeProcessNpcTurn();
  }

  private shouldRefreshIdleVisuals() {
    if (this.arrivalEffectPlaying || this.strategyAnimationPlaying || this.input.activePointer.isDown) {
      return false;
    }

    const snapshot = getGalaxySnapshot();
    return snapshot.turnPhase === "deploy" || snapshot.turnPhase === "fortify" || snapshot.turnPhase === "command";
  }

  private isCinematicMode() {
    return this.arrivalEffectPlaying || this.strategyAnimationPlaying;
  }

  private drawCommandPanel(snapshot: GalaxySnapshot) {
    if (this.arrivalEffectPlaying || this.strategyAnimationPlaying || snapshot.turnPhase === "gameOver") {
      return;
    }

    this.commandPanel.draw({
      snapshot,
      selectedSystemId: this.selectedSystemId,
      destinationSystemId: this.destinationSystemId,
      callbacks: {
        onSkipDeploy: () => {
          skipDeployment();
          this.clearSelection();
          this.render();
        },
        onEndCommand: () => {
          skipCommand();
          this.clearSelection();
          this.render();
        },
        onEndFortify: () => {
          finishFortifyPhase();
          this.clearSelection();
          this.render();
        },
        onCancelSelection: () => {
          this.clearSelection();
          this.render();
        },
        onCancelDestination: () => {
          this.destinationSystemId = undefined;
          this.fortifyUnitsToMove = undefined;
          this.render();
        },
        onLaunchMove: () => this.launchMove(),
        onAutoResolveMove: () => this.autoResolveMove(),
        onExecuteFortify: () => this.executeSelectedFortify(),
        getFortifyUnits: (originUnits, maxMovable) => this.normalizedFortifyUnits(originUnits, maxMovable),
        onSetFortifyUnitsFromSlider: (pointerX, sliderX, sliderW, originUnits, maxMovable) => {
          this.setFortifyUnitsFromSlider(pointerX, sliderX, sliderW, originUnits, maxMovable);
        }
      }
    });
  }

  private handleSystemClick(systemId: string) {
    if (this.arrivalEffectPlaying || this.strategyAnimationPlaying) {
      return;
    }

    const snapshot = getGalaxySnapshot();
    if (snapshot.turnPhase === "npcTurn" || snapshot.turnPhase === "gameOver") {
      return;
    }

    const system = snapshot.systems.find((candidate) => candidate.id === systemId);
    const selected = snapshot.systems.find((candidate) => candidate.id === this.selectedSystemId);
    if (!system) {
      return;
    }

    if (snapshot.turnPhase === "deploy") {
      if (deployToSystem(system.id)) {
        this.clearSelection();
        this.render();
        this.playDeployDrop(system.id);
      } else {
        this.playInvalidTap(system);
      }
      return;
    }

    if (!selected) {
      if (system.owner === "player" && system.fleetUnits > 1) {
        this.selectedSystemId = system.id;
        this.destinationSystemId = undefined;
      } else {
        this.playInvalidTap(system);
      }
      this.render();
      return;
    }

    if (system.id === selected.id) {
      this.clearSelection();
      this.render();
      return;
    }

    if (snapshot.turnPhase === "command") {
      this.handleCommandClick(system, selected);
      return;
    }

    if (snapshot.turnPhase === "fortify") {
      this.handleFortifyClick(system, selected);
    }
  }

  private handleCommandClick(system: StarSystem, selected: StarSystem) {
    if (system.owner === "player") {
      this.selectedSystemId = system.fleetUnits > 1 ? system.id : undefined;
      this.destinationSystemId = undefined;
      this.render();
      return;
    }

    if (selected.neighbours.includes(system.id)) {
      this.destinationSystemId = system.id;
      this.render();
      return;
    }

    this.playInvalidTap(system);
  }

  private handleFortifyClick(system: StarSystem, selected: StarSystem) {
    if (system.owner === "player" && selected.neighbours.includes(system.id)) {
      this.destinationSystemId = system.id;
      this.fortifyUnitsToMove = this.defaultFortifyUnits(selected.fleetUnits, Math.max(1, selected.fleetUnits - 1));
      this.render();
      return;
    }

    if (system.owner === "player") {
      this.selectedSystemId = system.fleetUnits > 1 ? system.id : undefined;
      this.destinationSystemId = undefined;
      this.fortifyUnitsToMove = undefined;
      this.render();
      return;
    }

    this.playInvalidTap(system);
  }

  private launchMove() {
    const attack = this.prepareSelectedAttackAnimation();
    if (!attack) {
      return;
    }

    this.animateStrategicAttack(attack.origin, attack.destination, () => {
      let runInput: ReturnType<typeof commitMoveOrder>;
      try {
        runInput = commitMoveOrder({
          originSystemId: attack.origin.id,
          destinationSystemId: attack.destination.id,
          unitsCommitted: 1
        });
      } catch (error) {
        console.error("Strategic attack commit failed", error);
        this.finishStrategicAttackAnimation();
        this.render();
        return;
      }

      this.finishStrategicAttackAnimation();
      if (runInput) {
        gameEvents.emit("galaxy:start-run", runInput);
      } else {
        this.render();
      }
    });
  }

  private autoResolveMove() {
    const attack = this.prepareSelectedAttackAnimation();
    if (!attack) {
      return;
    }

    this.clearSelection();
    this.strategyAnimationPlaying = true;
    this.arrivalEffectPlaying = true;
    let effect: ReturnType<typeof autoResolveStrategicBattle>;
    try {
      effect = autoResolveStrategicBattle(attack.origin.id, attack.destination.id);
    } catch (error) {
      console.error("Auto strategic battle failed", error);
      this.strategyAnimationPlaying = false;
      this.arrivalEffectPlaying = false;
      this.activeAction = undefined;
      this.render();
      return;
    }

    this.strategyAnimationPlaying = false;

    if (effect) {
      consumePendingStrategicArrivalEffect();
      this.render();
      this.playStrategicArrivalEffect(effect);
      return;
    }

    this.arrivalEffectPlaying = false;
    this.render();
  }

  private executeSelectedFortify() {
    if (!this.selectedSystemId || !this.destinationSystemId) {
      return;
    }

    const snapshot = getGalaxySnapshot();
    const origin = snapshot.systems.find((candidate) => candidate.id === this.selectedSystemId);
    const destination = snapshot.systems.find((candidate) => candidate.id === this.destinationSystemId);
    if (!origin || !destination) {
      return;
    }

    const maxMovable = Math.max(1, origin.fleetUnits - 1);
    const unitsToMove = this.normalizedFortifyUnits(origin.fleetUnits, maxMovable);
    if (!canFortifyMove(origin.id, destination.id, unitsToMove) || !executeFortify(origin.id, destination.id, unitsToMove)) {
      this.playInvalidTap(origin);
      return;
    }

    this.activeAction = {
      title: "Redeploy",
      detail: `${unitsToMove}`,
      faction: "player",
      originSystemId: origin.id,
      destinationSystemId: destination.id
    };
    this.clearSelection();
    this.strategyAnimationPlaying = true;
    this.render();
    try {
      this.animateRouteTransfer(origin, destination, "player", () => {
        this.strategyAnimationPlaying = false;
        this.activeAction = undefined;
        this.render();
      });
    } catch (error) {
      console.error("Redeploy animation failed", error);
      this.strategyAnimationPlaying = false;
      this.activeAction = undefined;
      this.render();
    }
  }

  private defaultFortifyUnits(originUnits: number, maxMovable: number) {
    return Phaser.Math.Clamp(Math.round(originUnits * 0.5), 1, maxMovable);
  }

  private normalizedFortifyUnits(originUnits: number, maxMovable: number) {
    const defaultUnits = this.defaultFortifyUnits(originUnits, maxMovable);
    this.fortifyUnitsToMove = Phaser.Math.Clamp(this.fortifyUnitsToMove ?? defaultUnits, 1, maxMovable);
    return this.fortifyUnitsToMove;
  }

  private setFortifyUnits(units: number, maxMovable: number) {
    const nextUnits = Phaser.Math.Clamp(units, 1, maxMovable);
    if (this.fortifyUnitsToMove === nextUnits) {
      return;
    }

    this.fortifyUnitsToMove = nextUnits;
    this.render();
  }

  private setFortifyUnitsFromSlider(pointerX: number, sliderX: number, sliderW: number, originUnits: number, maxMovable: number) {
    const ratio = Phaser.Math.Clamp((pointerX - sliderX) / sliderW, 0, 1);
    const units = Math.round(1 + ratio * (maxMovable - 1));
    this.setFortifyUnits(units || this.defaultFortifyUnits(originUnits, maxMovable), maxMovable);
  }

  private prepareSelectedAttackAnimation() {
    if (!this.selectedSystemId || !this.destinationSystemId) {
      return undefined;
    }

    const snapshot = getGalaxySnapshot();
    const origin = snapshot.systems.find((candidate) => candidate.id === this.selectedSystemId);
    const destination = snapshot.systems.find((candidate) => candidate.id === this.destinationSystemId);
    if (!origin || !destination || !canCreateMoveOrder(origin.id, destination.id, 1)) {
      if (origin) {
        this.playInvalidTap(origin);
      }
      return undefined;
    }

    return { origin, destination };
  }

  private animateStrategicAttack(origin: StarSystem, destination: StarSystem, onComplete: () => void) {
    this.activeAction = {
      title: "Attack",
      detail: "1",
      faction: "player",
      originSystemId: origin.id,
      destinationSystemId: destination.id
    };
    this.clearSelection();
    this.strategyAnimationPlaying = true;
    this.render();
    try {
      this.playDirectionalAttackAnimation(origin, destination, {}, onComplete);
    } catch (error) {
      console.error("Strategic attack animation failed", error);
      this.finishStrategicAttackAnimation();
      this.render();
    }
  }

  private finishStrategicAttackAnimation() {
    this.strategyAnimationPlaying = false;
    this.activeAction = undefined;
    this.clearSelection();
  }

  private playDirectionalAttackAnimation(
    origin: StarSystem,
    destination: StarSystem,
    options: DirectionalAttackOptions,
    onComplete: () => void
  ) {
    const source = new Phaser.Math.Vector2(mapX(origin.x), mapY(origin.y));
    const target = new Phaser.Math.Vector2(mapX(destination.x), mapY(destination.y));
    const delta = target.clone().subtract(source);
    const distance = delta.length();
    if (distance <= 0) {
      this.time.delayedCall(120, onComplete);
      return;
    }

    const direction = delta.clone().normalize();
    const angle = Phaser.Math.Angle.Between(source.x, source.y, target.x, target.y);
    const sourceRadius = options.sourceRadius ?? 22;
    const targetRadius = options.targetRadius ?? 23;
    const sourceColor = options.sourceColor ?? 0x28c9ff;
    const beamColor = options.beamColor ?? 0x6eeeff;
    const impactColor = options.impactColor ?? 0xffd45f;
    const overlay = this.add.container(0, 0).setDepth(132);

    this.createSourceChargeEffect(overlay, source, sourceColor, sourceRadius);
    this.time.delayedCall(260, () => {
      this.createAttackTrailEffect(overlay, source, target, angle, beamColor);
      this.createDirectionalArrowParticles(overlay, source, target, angle, beamColor, impactColor);
    });
    this.time.delayedCall(860, () => {
      this.createTargetImpactEffect(overlay, target, direction, impactColor, targetRadius);
    });
    this.time.delayedCall(1120, () => {
      this.pulseTargetAftermath(overlay, target, impactColor, targetRadius);
    });
    this.time.delayedCall(1480, () => {
      overlay.destroy(true);
      onComplete();
    });
  }

  private createSourceChargeEffect(overlay: Phaser.GameObjects.Container, source: Phaser.Math.Vector2, color: number, radius: number) {
    const core = this.add.circle(source.x, source.y, radius + 6, color, 0.18).setStrokeStyle(2.5, color, 0.75);
    overlay.add(core);
    this.tweens.add({
      targets: core,
      alpha: 0.42,
      scale: 1.18,
      yoyo: true,
      repeat: 1,
      duration: 170,
      ease: "Sine.easeInOut"
    });

    for (let index = 0; index < 3; index += 1) {
      const ring = this.add.circle(source.x, source.y, radius + 2, color, 0.16).setStrokeStyle(2.4, color, 0.84);
      overlay.add(ring);
      this.tweens.add({
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
      const spark = this.add.circle(source.x, source.y, Phaser.Math.FloatBetween(1.2, 2.4), 0xd9f7ff, 0.9);
      overlay.add(spark);
      this.tweens.add({
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
    const glow = this.add.line(0, 0, source.x, source.y, target.x, target.y, color, 0.28).setOrigin(0, 0).setLineWidth(9);
    const core = this.add.line(0, 0, source.x, source.y, target.x, target.y, 0xf7fbff, 0.82).setOrigin(0, 0).setLineWidth(2.5);
    const leading = this.add.rectangle(source.x, source.y, 26, 5, 0xf7fbff, 0.9).setRotation(angle);
    overlay.add([glow, core, leading]);

    this.tweens.add({
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
    this.tweens.add({
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
      const arrow = this.add.triangle(start.x, start.y, 0, -5.5, 18, 0, 0, 5.5, index > 4 ? impactColor : beamColor, 0.92).setRotation(angle);
      overlay.add(arrow);
      this.tweens.add({
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
      const particle = this.add.circle(start.x, start.y, Phaser.Math.FloatBetween(1, 2.1), index % 5 === 0 ? 0xf7fbff : beamColor, 0.8);
      overlay.add(particle);
      this.tweens.add({
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
    const flash = this.add.circle(impactPoint.x, impactPoint.y, 11, 0xf7fbff, 0.98).setStrokeStyle(2.5, color, 0.94);
    overlay.add(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.8,
      duration: 320,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });

    for (let index = 0; index < 3; index += 1) {
      const shockwave = this.add.circle(target.x, target.y, radius + 2, color, 0.12).setStrokeStyle(2.4, color, 0.82);
      overlay.add(shockwave);
      this.tweens.add({
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
      const spark = this.add.circle(impactPoint.x, impactPoint.y, Phaser.Math.FloatBetween(1.2, 2.7), index % 4 === 0 ? 0xf7fbff : color, 0.88);
      overlay.add(spark);
      this.tweens.add({
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
      const pulse = this.add.circle(target.x, target.y, radius + 4, color, 0.1).setStrokeStyle(2.2, color, 0.68);
      overlay.add(pulse);
      this.tweens.add({
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

  private maybeProcessNpcTurn() {
    const snapshot = getGalaxySnapshot();
    if (snapshot.turnPhase !== "npcTurn" || this.npcProcessing || this.strategyAnimationPlaying || this.arrivalEffectPlaying) {
      return;
    }

    this.npcProcessing = true;
    this.time.delayedCall(560, () => {
      try {
        const before = getGalaxySnapshot();
        const { action, completedRound } = executeNextNpcTurn();
        this.activeAction = action;
        this.strategyAnimationPlaying = true;
        this.render();
        this.animateNpcAction(action, before.systems, () => {
          this.npcProcessing = false;
          this.strategyAnimationPlaying = false;
          if (completedRound) {
            this.activeAction = undefined;
            finishNpcRound();
          } else {
            this.activeAction = undefined;
          }
          this.render();
        });
      } catch (error) {
        console.error("NPC turn animation failed", error);
        this.npcProcessing = false;
        this.strategyAnimationPlaying = false;
        this.activeAction = undefined;
        this.render();
      }
    });
  }

  private animateNpcAction(action: GalaxyAction, beforeSystems: StarSystem[], onComplete: () => void) {
    const origin = beforeSystems.find((system) => system.id === action.originSystemId);
    const destination = beforeSystems.find((system) => system.id === action.destinationSystemId);
    if (origin && destination) {
      this.animateRouteTransfer(origin, destination, action.faction, onComplete);
      return;
    }
    if (origin) {
      this.pulseSystem(origin, ownerPalette[action.faction].fill, onComplete);
      return;
    }
    this.time.delayedCall(520, onComplete);
  }

  private animateRouteTransfer(origin: StarSystem, destination: StarSystem, faction: FactionId, onComplete: () => void) {
    const color = ownerPalette[faction].fill;
    for (let index = 0; index < 7; index += 1) {
      const dot = this.add.circle(mapX(origin.x), mapY(origin.y), 3.8, color, 0.9).setDepth(120);
      this.tweens.add({
        targets: dot,
        x: mapX(destination.x),
        y: mapY(destination.y),
        alpha: 0.2,
        delay: index * 70,
        duration: 560,
        ease: "Cubic.easeInOut",
        onComplete: () => dot.destroy()
      });
    }
    this.time.delayedCall(980, onComplete);
  }

  private pulseSystem(system: StarSystem, color: number, onComplete: () => void) {
    const ring = this.add.circle(mapX(system.x), mapY(system.y), 22, color, 0.18).setStrokeStyle(4, color, 0.8).setDepth(120);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 2.1,
      duration: 640,
      ease: "Quad.easeOut",
      onComplete: () => {
        ring.destroy();
        onComplete();
      }
    });
  }

  private playDeployDrop(systemId: string) {
    const system = getGalaxySnapshot().systems.find((candidate) => candidate.id === systemId);
    if (!system) {
      return;
    }
    const token = this.add.circle(mapX(system.x), mapY(system.y) - 34, 5, 0x66f2a8, 0.9).setStrokeStyle(1.5, 0xffffff, 0.72).setDepth(120);
    this.tweens.add({
      targets: token,
      y: mapY(system.y),
      alpha: 0,
      scale: 1.7,
      duration: 360,
      ease: "Cubic.easeIn",
      onComplete: () => token.destroy()
    });
  }

  private playInvalidTap(system: StarSystem) {
    const ring = this.add.circle(mapX(system.x), mapY(system.y), 20, 0x9aa8b5, 0.08).setStrokeStyle(2, 0x9aa8b5, 0.45).setDepth(90);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 1.45,
      duration: 180,
      onComplete: () => ring.destroy()
    });
  }

  private clearSelection() {
    this.selectedSystemId = undefined;
    this.destinationSystemId = undefined;
    this.fortifyUnitsToMove = undefined;
  }

  private playPendingArrivalEffect() {
    const effect = consumePendingStrategicArrivalEffect();
    if (!effect) {
      return;
    }

    this.playStrategicArrivalEffect(effect);
  }

  private playStrategicArrivalEffect(effect: StrategicArrivalEffect) {
    this.clearSelection();
    const snapshot = getGalaxySnapshot();
    const origin = snapshot.systems.find((system) => system.id === effect.originSystemId);
    const destination = snapshot.systems.find((system) => system.id === effect.destinationSystemId);
    if (!origin || !destination) {
      this.arrivalEffectPlaying = false;
      this.activeAction = undefined;
      this.resetCamera();
      this.render();
      return;
    }

    const visualOrigin = toVisualSystem(origin);
    const visualDestination = toVisualSystem(destination);
    this.arrivalEffectPlaying = true;
    this.activeAction = {
      title: "Arrival",
      detail: "",
      faction: "player",
      originSystemId: origin.id,
      destinationSystemId: destination.id
    };
    this.render();
    this.time.delayedCall(110, () => {
      try {
        playSwarmStabilisationEffect({
          scene: this,
          origin: visualOrigin,
          destination: visualDestination,
          effect,
          onComplete: () => {
            this.arrivalEffectPlaying = false;
            this.activeAction = undefined;
            this.resetCamera();
            this.render();
          }
        });
      } catch (error) {
        console.error("Arrival effect failed", error);
        this.arrivalEffectPlaying = false;
        this.activeAction = undefined;
        this.resetCamera();
        this.render();
      }
    });
  }
}
