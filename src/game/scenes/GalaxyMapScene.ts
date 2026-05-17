import Phaser from "phaser";
import { playSwarmStabilisationEffect } from "../effects/SwarmStabilisationEffect";
import { gameEvents } from "../events";
import {
  autoResolveStrategicBattle,
  canCreateMoveOrder,
  canFortifyMove,
  commitMoveOrder,
  consumePendingStrategicArrivalEffect,
  deployToSystem,
  estimateAutoIncursionChance,
  executeFortify,
  executeNextNpcTurn,
  finishFortifyPhase,
  finishNpcRound,
  getFactionName,
  getGalaxySnapshot,
  skipCommand,
  skipDeployment
} from "../systems/galaxyState";
import { factionThemes } from "../systems/factionTheme";
import { getSystemTypeTraits, type SystemType } from "../systems/systemTypeTraits";
import type { Constellation, FactionId, GalaxyAction, StarSystem, StrategicArrivalEffect } from "../systems/galaxyTypes";

const ownerPalette: Record<FactionId, { fill: number; stroke: number; label: string }> = {
  player: { fill: factionThemes.player.mapFill, stroke: factionThemes.player.mapStroke, label: factionThemes.player.label },
  crimson: { fill: factionThemes.crimson.mapFill, stroke: factionThemes.crimson.mapStroke, label: factionThemes.crimson.label },
  amber: { fill: factionThemes.amber.mapFill, stroke: factionThemes.amber.mapStroke, label: factionThemes.amber.label },
  violet: { fill: factionThemes.violet.mapFill, stroke: factionThemes.violet.mapStroke, label: factionThemes.violet.label },
  neutral: { fill: factionThemes.neutral.mapFill, stroke: factionThemes.neutral.mapStroke, label: factionThemes.neutral.label }
};

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;
type DirectionalAttackOptions = {
  sourceColor?: number;
  beamColor?: number;
  impactColor?: number;
  sourceRadius?: number;
  targetRadius?: number;
};

const mapLeftX = 82;
const mapScaleX = 0.78;
const mapTopY = 24;
const mapScaleY = 0.96;

export class GalaxyMapScene extends Phaser.Scene {
  private selectedSystemId?: string;
  private destinationSystemId?: string;
  private fortifyUnitsToMove?: number;
  private npcProcessing = false;
  private arrivalEffectPlaying = false;
  private strategyAnimationPlaying = false;
  private activeAction?: GalaxyAction;

  constructor() {
    super("GalaxyMapScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#06111e");
    this.resetCamera();
    this.render();
    this.playPendingArrivalEffect();
  }

  private resetCamera() {
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setZoom(1);
    this.cameras.main.setRotation(0);
    this.cameras.main.setAlpha(1);
  }

  private mapX(x: number) {
    return mapLeftX + x * mapScaleX;
  }

  private mapY(y: number) {
    return mapTopY + y * mapScaleY;
  }

  private render() {
    this.children.removeAll(true);
    const snapshot = getGalaxySnapshot();
    const cinematicMode = this.isCinematicMode();
    this.drawBackground();
    this.drawConstellations(snapshot.systems, snapshot.constellations, snapshot.turnPhase);
    if (!cinematicMode) {
      this.drawPhaseHud(snapshot);
    }
    this.drawStarlanes(snapshot.systems);
    this.drawSystems(snapshot);
    if (!cinematicMode && snapshot.turnPhase === "deploy") {
      this.drawDeployProductionEffects(snapshot);
    }
    if (cinematicMode) {
      this.drawCinematicShade();
    } else {
      this.drawActionBadge(snapshot);
      this.drawCommandStrip(snapshot);
      this.drawDebugLog(snapshot);
    }
    if (snapshot.turnPhase === "gameOver") {
      this.drawGameOver(snapshot);
    }
    this.maybeProcessNpcTurn();
  }

  private isCinematicMode() {
    return this.arrivalEffectPlaying || this.strategyAnimationPlaying;
  }

  private drawCinematicShade() {
    this.add.rectangle(195, 360, 390, 720, 0x020913, 0.34).setDepth(20);
  }

  private drawBackground() {
    for (let index = 0; index < 116; index += 1) {
      const x = (index * 97) % 390;
      const y = (index * 173) % 720;
      const alpha = 0.12 + ((index * 19) % 50) / 115;
      const radius = 0.6 + ((index * 11) % 16) / 11;
      this.add.circle(x, y, radius, 0xd9f7ff, alpha).setDepth(0);
    }

    this.add.circle(340, 110, 76, 0x18436b, 0.1).setDepth(0);
    this.add.circle(34, 640, 92, 0x3f1d55, 0.1).setDepth(0);
  }

  private drawConstellations(systems: StarSystem[], constellations: Constellation[], turnPhase: GalaxySnapshot["turnPhase"]) {
    for (const constellation of constellations) {
      const members = systems.filter((system) => system.constellationId === constellation.id);
      if (members.length === 0) {
        continue;
      }

      const minX = Math.min(...members.map((system) => this.mapX(system.x)));
      const maxX = Math.max(...members.map((system) => this.mapX(system.x)));
      const minY = Math.min(...members.map((system) => this.mapY(system.y)));
      const maxY = Math.max(...members.map((system) => this.mapY(system.y)));
      const x = (minX + maxX) / 2;
      const y = (minY + maxY) / 2;
      const width = Math.max(78, maxX - minX + 74);
      const height = Math.max(64, maxY - minY + 58);

      this.add.ellipse(x, y, width, height, constellation.tint, 0.025).setStrokeStyle(1, constellation.tint, 0.06).setDepth(0.5);
      if (turnPhase === "deploy" && members.every((system) => system.owner === "player")) {
        this.drawConstellationBonusPulse(x, y, width, height, constellation.tint);
      }
    }
  }

  private drawPhaseHud(snapshot: GalaxySnapshot) {
    this.add.rectangle(39, 360, 78, 720, 0x03101b, 0.66).setStrokeStyle(1.2, 0x315a77, 0.58).setDepth(45);
    this.add
      .text(39, 34, "TURN 7", {
        color: "#7ee4ff",
        fontFamily: "Inter, sans-serif",
        fontSize: "10px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.add.line(0, 0, 39, 126, 39, 544, 0x5da8ff, 0.32).setOrigin(0, 0).setLineWidth(2).setDepth(46);
    this.drawPhaseStep(1, 39, 118, "Add", "Bonus", this.phaseStepState(snapshot, 1));
    this.drawPhaseStep(2, 39, 252, "Redeploy", "", this.phaseStepState(snapshot, 2));
    this.drawPhaseStep(3, 39, 386, "Attack", "", this.phaseStepState(snapshot, 3));
    this.drawPhaseStep(4, 39, 520, "Enemy", "Moves", this.phaseStepState(snapshot, 4));
  }

  private phaseStepState(snapshot: GalaxySnapshot, step: number) {
    switch (snapshot.turnPhase) {
      case "deploy":
        return step === 1 ? "active" : "upcoming";
      case "fortify":
        return step === 1 ? "complete" : step === 2 ? "active" : "upcoming";
      case "command":
        return step < 3 ? "complete" : step === 3 ? "active" : "upcoming";
      case "npcTurn":
        return step < 4 ? "complete" : step === 4 ? "active" : "upcoming";
      case "gameOver":
        return "complete";
    }
  }

  private drawPhaseStep(step: number, x: number, y: number, line1: string, line2: string, state: "complete" | "active" | "upcoming") {
    const color = state === "complete" ? 0x66f2a8 : state === "active" ? 0xffd45f : 0x8da2b5;
    const alpha = state === "upcoming" ? 0.42 : 0.92;
    const radius = state === "active" ? 25 : 19;
    this.add.circle(x, y, radius + 8, color, state === "active" ? 0.13 : 0.07).setStrokeStyle(state === "active" ? 3 : 2, color, alpha * 0.45).setDepth(48);
    this.add.circle(x, y, radius, 0x07131d, 0.9).setStrokeStyle(state === "active" ? 4 : 2.4, color, alpha).setDepth(49);
    this.add
      .text(x, y, state === "complete" ? "✓" : String(step), {
        color: state === "upcoming" ? "#9fb7c7" : "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: state === "active" ? "22px" : "16px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.add
      .text(x, y + radius + 17, line2 ? `${line1}\n${line2}` : line1, {
        color: state === "active" ? "#ffe66f" : state === "complete" ? "#c7f7dd" : "#9fb7c7",
        fontFamily: "Inter, sans-serif",
        fontSize: state === "active" ? "16px" : "9px",
        fontStyle: "900",
        align: "center",
        lineSpacing: 1
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
  }

  private drawStarlanes(systems: StarSystem[]) {
    const byId = new Map(systems.map((system) => [system.id, system]));
    const drawn = new Set<string>();

    for (const system of systems) {
      for (const neighbourId of system.neighbours) {
        const neighbour = byId.get(neighbourId);
        if (!neighbour) {
          continue;
        }

        const key = [system.id, neighbour.id].sort().join(":");
        if (drawn.has(key)) {
          continue;
        }
        drawn.add(key);

        const isSelectedRoute = this.isSelectedRoute(system.id, neighbour.id);
        const isActionLane = this.isActionLane(system.id, neighbour.id);
        const color = isActionLane ? 0xffe66f : isSelectedRoute ? 0x66f2a8 : 0x4c6478;
        const alpha = isActionLane ? 0.92 : isSelectedRoute ? 0.72 : 0.16;
        const width = isActionLane ? 5 : isSelectedRoute ? 4 : 2.2;
        const line = this.add.line(0, 0, this.mapX(system.x), this.mapY(system.y), this.mapX(neighbour.x), this.mapY(neighbour.y), color, alpha);
        line.setOrigin(0, 0).setLineWidth(width).setDepth(isActionLane || isSelectedRoute ? 4 : 1);

        if (isActionLane || isSelectedRoute) {
          this.drawRouteMotion(system, neighbour, color, isActionLane ? 5 : 4);
        }
      }
    }
  }

  private drawRouteMotion(origin: StarSystem, destination: StarSystem, color: number, count: number) {
    const timeOffset = (this.time.now * 0.0012) % 1;
    for (let index = 0; index < count; index += 1) {
      const t = (timeOffset + index / count) % 1;
      const x = Phaser.Math.Linear(this.mapX(origin.x), this.mapX(destination.x), t);
      const y = Phaser.Math.Linear(this.mapY(origin.y), this.mapY(destination.y), t);
      this.add.circle(x, y, 2.7, color, 0.9).setDepth(5);
    }
  }

  private drawSystems(snapshot: GalaxySnapshot) {
    const selected = snapshot.systems.find((system) => system.id === this.selectedSystemId);
    const time = this.time.now;

    for (const system of snapshot.systems) {
      const palette = ownerPalette[system.owner];
      const cue = this.systemCue(snapshot, system, selected);
      const isSelected = system.id === this.selectedSystemId;
      const isDestination = system.id === this.destinationSystemId;
      const isActionEndpoint = system.id === this.activeAction?.originSystemId || system.id === this.activeAction?.destinationSystemId;
      const radius = system.systemType === "core" ? 19 : system.systemType === "fortress" ? 18 : 16;

      this.drawCueHalo(system, radius, cue, time);
      if (isSelected || isDestination || isActionEndpoint) {
        const color = isActionEndpoint ? 0xffe66f : isSelected ? 0xffe66f : 0x66f2a8;
        this.add.circle(this.mapX(system.x), this.mapY(system.y), radius + 18, color, 0.1).setStrokeStyle(5, color, 0.3).setDepth(2.8);
        this.add.circle(this.mapX(system.x), this.mapY(system.y), radius + 11, color, 0.18).setStrokeStyle(3, color, 0.9).setDepth(3);
      }
      this.drawSystemTypeVisual(system, radius, time);

      const body = this.add.circle(this.mapX(system.x), this.mapY(system.y), radius, palette.fill, 0.93).setStrokeStyle(3, palette.stroke, 0.95).setDepth(5);
      body.setInteractive({ useHandCursor: true });
      body.on("pointerdown", () => this.handleSystemClick(system.id));

      this.add.circle(this.mapX(system.x) - radius * 0.32, this.mapY(system.y) - radius * 0.35, Math.max(2.4, radius * 0.18), 0xffffff, 0.56).setDepth(6);
      this.add
        .text(this.mapX(system.x), this.mapY(system.y) - 2, String(system.fleetUnits), {
          color: "#06111e",
          fontFamily: "Inter, sans-serif",
          fontSize: "15px",
          fontStyle: "900"
        })
        .setOrigin(0.5)
        .setDepth(7);
      this.add
        .text(this.mapX(system.x), this.mapY(system.y) + radius + 6, system.name, {
          color: "#f7fbff",
          fontFamily: "Inter, sans-serif",
          fontSize: "10.5px",
          fontStyle: "800"
        })
        .setOrigin(0.5)
        .setStroke("#06111e", 4)
        .setDepth(7);
    }
  }

  private systemCue(snapshot: GalaxySnapshot, system: StarSystem, selected: StarSystem | undefined) {
    if (this.arrivalEffectPlaying || this.strategyAnimationPlaying) {
      return "none";
    }
    if (snapshot.turnPhase === "deploy" && system.owner === "player" && snapshot.deploymentUnitsRemaining > 0) {
      return "deploy";
    }
    if (snapshot.turnPhase === "command") {
      if (!selected && system.owner === "player" && system.fleetUnits > 1) {
        return "attack-origin";
      }
      if (selected && selected.neighbours.includes(system.id) && system.owner !== "player") {
        return "attack-target";
      }
    }
    if (snapshot.turnPhase === "fortify") {
      if (selected && this.destinationSystemId) {
        return "none";
      }
      if (!selected && system.owner === "player" && system.fleetUnits > 1) {
        return "fortify-origin";
      }
      if (selected && selected.neighbours.includes(system.id) && system.owner === "player" && selected.id !== system.id) {
        return "fortify-target";
      }
    }
    return "none";
  }

  private drawCueHalo(system: StarSystem, radius: number, cue: string, time: number) {
    if (cue === "none") {
      return;
    }

    const pulse = 0.5 + Math.sin(time * 0.006 + system.x * 0.03) * 0.5;
    const color = cue === "deploy" ? 0x66f2a8 : cue === "attack-origin" ? 0xffe66f : cue === "attack-target" ? 0x66f2a8 : 0x7ee4ff;
    const alpha = Phaser.Math.Linear(0.16, 0.42, pulse);
    const scale = Phaser.Math.Linear(1, 1.18, pulse);
    this.add.circle(this.mapX(system.x), this.mapY(system.y), (radius + 10) * scale, color, alpha * 0.5).setStrokeStyle(2.2, color, alpha).setDepth(2);
  }

  private drawSystemTypeVisual(system: StarSystem, radius: number, time: number) {
    const type = this.systemType(system);
    const x = this.mapX(system.x);
    const y = this.mapY(system.y);
    const palette = ownerPalette[system.owner];

    switch (type) {
      case "mining":
        this.drawMiningVisual(x, y, radius, time);
        break;
      case "fortress":
        this.drawFortressVisual(x, y, radius, palette.stroke);
        break;
      case "core":
        this.drawCoreVisual(x, y, radius, palette.stroke);
        break;
      case "rift":
        this.drawRiftVisual(x, y, radius, time);
        break;
      case "frontier":
      default:
        this.add.circle(x, y, radius + 6, 0xd9edf5, 0).setStrokeStyle(1.2, 0xd9edf5, 0.3).setDepth(3.4);
        break;
    }
  }

  private drawMiningVisual(x: number, y: number, radius: number, time: number) {
    const orbit = radius + 10;
    for (let index = 0; index < 3; index += 1) {
      const angle = time * 0.0008 + index * ((Math.PI * 2) / 3);
      const pip = this.add.circle(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.82, 2.2, 0xffd45f, 0.92);
      pip.setStrokeStyle(0.8, 0xfff6b0, 0.75).setDepth(6.2);
    }
    this.add.circle(x + radius * 0.62, y - radius * 0.58, 2, 0xfff6b0, 0.72).setDepth(6.1);
  }

  private drawFortressVisual(x: number, y: number, radius: number, ownerStroke: number) {
    this.add.circle(x, y, radius + 8, 0xd9edf5, 0.02).setStrokeStyle(2.6, 0xd9edf5, 0.58).setDepth(3.5);
    for (let index = 0; index < 4; index += 1) {
      const angle = -Math.PI / 4 + index * (Math.PI / 2);
      const plate = this.add.rectangle(x + Math.cos(angle) * (radius + 12), y + Math.sin(angle) * (radius + 12), 11, 4, ownerStroke, 0.82);
      plate.setRotation(angle).setDepth(5.8);
    }
  }

  private drawCoreVisual(x: number, y: number, radius: number, ownerStroke: number) {
    this.add.circle(x, y, radius + 8, ownerStroke, 0.03).setStrokeStyle(1.5, 0x9ee7ff, 0.72).setDepth(3.5);
    this.add.circle(x, y, radius + 13, 0xffffff, 0.01).setStrokeStyle(1.1, 0xffffff, 0.42).setDepth(3.4);
    this.add.star(x, y - radius * 0.1, 5, 2.2, 4.8, 0xf7fbff, 0.78).setDepth(6.1);
  }

  private drawRiftVisual(x: number, y: number, radius: number, time: number) {
    const spin = (time * 0.0012) % (Math.PI * 2);
    this.drawArcSegment(x, y, radius + 9, spin, spin + 1.35, 0x66f2ff, 0.78, 2.2, 5.7);
    this.drawArcSegment(x, y, radius + 9, spin + Math.PI, spin + Math.PI + 1.05, 0x9b6dff, 0.7, 2.2, 5.7);
    this.add.triangle(x - radius - 7, y + 1, 0, -3, 7, 0, 0, 3, 0x9b6dff, 0.72).setRotation(spin + 0.5).setDepth(5.8);
    this.add.circle(x + radius + 7, y - 2, 1.9, 0x66f2ff, 0.75).setDepth(5.8);
  }

  private drawArcSegment(x: number, y: number, radius: number, start: number, end: number, color: number, alpha: number, width: number, depth: number) {
    const arc = this.add.graphics();
    arc.lineStyle(width, color, alpha);
    arc.beginPath();
    arc.arc(x, y, radius, start, end, false);
    arc.strokePath();
    arc.setDepth(depth);
  }

  private drawDeployProductionEffects(snapshot: GalaxySnapshot) {
    if (snapshot.deploymentUnitsRemaining <= 0) {
      return;
    }

    const phaseTarget = new Phaser.Math.Vector2(39, 118);
    for (const system of snapshot.systems) {
      if (system.owner !== "player") {
        continue;
      }

      const traits = getSystemTypeTraits(system);
      if (traits.productionBonus <= 0) {
        continue;
      }

      const source = new Phaser.Math.Vector2(this.mapX(system.x), this.mapY(system.y));
      const color = this.systemType(system) === "mining" ? 0xffd45f : 0x9ee7ff;
      this.drawProductionPulse(source, phaseTarget, color, this.systemType(system) === "mining" ? 0.18 : 0);
    }
  }

  private drawProductionPulse(source: Phaser.Math.Vector2, target: Phaser.Math.Vector2, color: number, delaySeconds: number) {
    const particle = this.add.circle(source.x, source.y, 3.2, color, 0.86).setStrokeStyle(1, 0xffffff, 0.55).setDepth(62);
    this.tweens.add({
      targets: particle,
      x: target.x,
      y: target.y,
      alpha: 0,
      scale: 0.5,
      delay: delaySeconds * 1000,
      duration: 980,
      ease: "Sine.easeInOut",
      onComplete: () => particle.destroy()
    });
  }

  private drawConstellationBonusPulse(x: number, y: number, width: number, height: number, color: number) {
    const pulse = this.add.ellipse(x, y, width + 12, height + 10, color, 0.03).setStrokeStyle(1.7, color, 0.22).setDepth(0.7);
    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: 1.06,
      duration: 1100,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy()
    });

    const particle = this.add.circle(x, y, 3.6, color, 0.72).setDepth(62);
    this.tweens.add({
      targets: particle,
      x: 39,
      y: 118,
      alpha: 0,
      scale: 0.5,
      duration: 1120,
      ease: "Sine.easeInOut",
      onComplete: () => particle.destroy()
    });
  }

  private drawActionBadge(snapshot: GalaxySnapshot) {
    if (!this.activeAction || this.arrivalEffectPlaying) {
      return;
    }

    const origin = snapshot.systems.find((system) => system.id === this.activeAction?.originSystemId);
    const destination = snapshot.systems.find((system) => system.id === this.activeAction?.destinationSystemId);
    const color = ownerPalette[this.activeAction.faction].fill;
    const x =
      origin && destination
        ? Phaser.Math.Clamp((this.mapX(origin.x) + this.mapX(destination.x)) / 2, 80, 330)
        : Phaser.Math.Clamp(origin ? this.mapX(origin.x) : 195, 80, 330);
    const y =
      origin && destination
        ? Phaser.Math.Clamp((this.mapY(origin.y) + this.mapY(destination.y)) / 2 - 22, 98, 610)
        : Phaser.Math.Clamp(origin ? this.mapY(origin.y) : 180, 98, 610);
    const label = compactActionLabel(this.activeAction);

    this.add.rectangle(x, y, Math.max(110, label.length * 7.2 + 24), 30, 0x07131d, 0.88).setStrokeStyle(2, color, 0.72).setDepth(90);
    this.add
      .text(x, y, label, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(91);
  }

  private drawCommandStrip(snapshot: GalaxySnapshot) {
    if (this.arrivalEffectPlaying || this.strategyAnimationPlaying || snapshot.turnPhase === "gameOver") {
      return;
    }

    const origin = snapshot.systems.find((system) => system.id === this.selectedSystemId);
    const destination = snapshot.systems.find((system) => system.id === this.destinationSystemId);

    if (snapshot.turnPhase === "deploy") {
      this.drawButton(318, 674, 50, 28, "Skip", () => {
        skipDeployment();
        this.clearSelection();
        this.render();
      });
      return;
    }

    if (snapshot.turnPhase === "command") {
      if (origin && destination) {
        this.drawAttackChoice(origin, destination);
        return;
      }
      this.drawButton(302, 674, 66, 28, "End", () => {
        skipCommand();
        this.clearSelection();
        this.render();
      });
      if (origin) {
        this.drawButton(22, 674, 68, 28, "Cancel", () => {
          this.clearSelection();
          this.render();
        });
      }
      return;
    }

    if (snapshot.turnPhase === "fortify") {
      if (origin && destination) {
        this.drawRedeployPanel(origin, destination);
        return;
      }
      this.drawButton(306, 674, 62, 28, "End", () => {
        finishFortifyPhase();
        this.clearSelection();
        this.render();
      });
      if (origin) {
        this.drawButton(22, 674, 68, 28, "Cancel", () => {
          this.clearSelection();
          this.render();
        });
      }
      return;
    }

    if (snapshot.turnPhase === "npcTurn") {
      const palette = ownerPalette[snapshot.currentFaction];
      this.drawMiniStatus(24, 675, getFactionName(snapshot.currentFaction), palette.fill);
    }
  }

  private drawAttackChoice(origin: StarSystem, destination: StarSystem) {
    const odds = Math.round(estimateAutoIncursionChance(origin.id, destination.id) * 100);
    const dockX = 92;
    const dockY = 632;
    const dockW = 282;
    const dockH = 58;
    this.add.rectangle(dockX + dockW / 2, dockY + dockH / 2, dockW, dockH, 0x07131d, 0.82).setStrokeStyle(1.8, 0x66f2a8, 0.42).setDepth(58);
    this.drawButton(108, 648, 64, 30, "Cancel", () => {
      this.destinationSystemId = undefined;
      this.fortifyUnitsToMove = undefined;
      this.render();
    }, "ghost");
    this.drawButton(184, 642, 76, 40, "Play", () => this.launchMove(), "primary");
    this.drawButton(272, 648, 84, 30, `Auto ${odds}%`, () => this.autoResolveMove(), "secondary");
    this.drawAttackPreview(origin, destination, odds / 100);
    this.drawRouteArrow(origin, destination, 0x66f2a8);
  }

  private drawRouteArrow(origin: StarSystem, destination: StarSystem, color: number) {
    const originX = this.mapX(origin.x);
    const destinationX = this.mapX(destination.x);
    const originY = this.mapY(origin.y);
    const destinationY = this.mapY(destination.y);
    const angle = Phaser.Math.Angle.Between(originX, originY, destinationX, destinationY);
    const arrowX = Phaser.Math.Linear(originX, destinationX, 0.62);
    const arrowY = Phaser.Math.Linear(originY, destinationY, 0.62);
    const path = this.add.line(0, 0, originX, originY, destinationX, destinationY, color, 0.28);
    path.setOrigin(0, 0).setLineWidth(7).setDepth(6);
    const arrow = this.add.triangle(arrowX, arrowY, 0, -7, 15, 0, 0, 7, color, 0.94);
    arrow.setRotation(angle);
    arrow.setDepth(8);
  }

  private drawAttackPreview(origin: StarSystem, destination: StarSystem, chance: number) {
    const originX = this.mapX(origin.x);
    const originY = this.mapY(origin.y);
    const destinationX = this.mapX(destination.x);
    const destinationY = this.mapY(destination.y);
    const originType = this.systemType(origin);
    const destinationTraits = getSystemTypeTraits(destination);
    const particleCount = Phaser.Math.Clamp(Math.round(3 + chance * 3), 3, 5);

    this.drawAttackOriginPips(originX, originY, originType);
    this.drawAttackRouteEnergy(originX, originY, destinationX, destinationY, particleCount, originType);
    this.drawTargetDefencePips(destinationX, destinationY, destinationTraits.defenceModifier, this.systemType(destination));
  }

  private drawAttackOriginPips(x: number, y: number, originType: SystemType) {
    const color = originType === "rift" ? 0x9b6dff : originType === "core" ? 0x9ee7ff : 0x66f2a8;
    const count = originType === "rift" || originType === "core" ? 4 : 3;
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI / 2 + index * ((Math.PI * 2) / count);
      this.add.circle(x + Math.cos(angle) * 30, y + Math.sin(angle) * 25, 2.3, color, 0.9).setDepth(8.2);
    }
    if (originType === "rift") {
      this.drawArcSegment(x, y, 34, -0.45, 0.72, 0x66f2ff, 0.82, 2.4, 8.1);
    }
    if (originType === "core") {
      this.add.circle(x, y, 31, 0xffffff, 0).setStrokeStyle(1.8, 0x9ee7ff, 0.78).setDepth(8.1);
    }
  }

  private drawAttackRouteEnergy(originX: number, originY: number, destinationX: number, destinationY: number, count: number, originType: SystemType) {
    const color = originType === "rift" ? 0x9b6dff : originType === "core" ? 0x9ee7ff : 0x66f2a8;
    for (let index = 0; index < count; index += 1) {
      const t = 0.2 + (index / Math.max(1, count - 1)) * 0.58;
      const x = Phaser.Math.Linear(originX, destinationX, t);
      const y = Phaser.Math.Linear(originY, destinationY, t);
      this.add.circle(x, y, 2.4, color, 0.76).setDepth(8.4);
    }
  }

  private drawTargetDefencePips(x: number, y: number, defenceModifier: number, targetType: SystemType) {
    const count = Phaser.Math.Clamp(Math.round(defenceModifier * 3), 2, 4);
    const color = targetType === "fortress" ? 0xd9edf5 : targetType === "core" ? 0x9ee7ff : 0x8da2b5;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI / 4 + index * ((Math.PI * 2) / count);
      this.add.rectangle(x + Math.cos(angle) * 31, y + Math.sin(angle) * 27, 6, 3, color, 0.82).setRotation(angle).setDepth(8.3);
    }
    if (targetType === "fortress" || targetType === "core") {
      const ring = this.add.circle(x, y, targetType === "fortress" ? 34 : 31, color, 0.04).setStrokeStyle(targetType === "fortress" ? 3 : 2, color, 0.76).setDepth(8.1);
      this.tweens.add({ targets: ring, alpha: 0, scale: 1.16, duration: 720, ease: "Sine.easeOut", onComplete: () => ring.destroy() });
    }
  }

  private drawMiniStatus(x: number, y: number, text: string, color: number) {
    this.add.circle(x, y + 9, 6, color, 0.9).setDepth(61);
    this.add
      .text(x + 13, y, text, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        fontStyle: "900"
      })
      .setDepth(61);
  }

  private drawRedeployPanel(origin: StarSystem, destination: StarSystem) {
    const maxMovable = Math.max(1, origin.fleetUnits - 1);
    const units = this.normalizedFortifyUnits(origin.fleetUnits, maxMovable);
    const panelCx = 235;
    const sliderX = 108;
    const sliderY = 638;
    const sliderW = 254;
    const ratio = maxMovable <= 1 ? 1 : (units - 1) / (maxMovable - 1);

    this.drawBottomSheet(148, 0x7ee4ff);
    this.add.rectangle(panelCx, 579, 34, 4, 0x7ee4ff, 0.72).setDepth(59);
    this.add
      .text(panelCx - 36, 596, origin.name, {
        color: "#ffe66f",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "900"
      })
      .setOrigin(1, 0.5)
      .setDepth(72);
    this.add
      .text(panelCx, 596, "->", {
        color: "#66f2a8",
        fontFamily: "Inter, sans-serif",
        fontSize: "15px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(72);
    this.add
      .text(panelCx + 36, 596, destination.name, {
        color: "#66f2a8",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "900"
      })
      .setOrigin(0, 0.5)
      .setDepth(72);
    this.add
      .text(panelCx, 624, `${units} units`, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "28px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(72);

    this.add.rectangle(sliderX + sliderW / 2, sliderY + 15, sliderW, 6, 0x24445b, 0.9).setDepth(72);
    this.add.rectangle(sliderX + (sliderW * ratio) / 2, sliderY + 15, Math.max(4, sliderW * ratio), 6, 0x66f2a8, 0.96).setDepth(73);
    this.add.circle(sliderX + sliderW * ratio, sliderY + 15, 12, 0xf7fbff, 0.98).setStrokeStyle(2, 0x7ee4ff, 0.9).setDepth(74);
    const sliderHit = this.add.rectangle(sliderX + sliderW / 2, sliderY, sliderW + 16, 34, 0xffffff, 0).setDepth(75);
    sliderHit.setInteractive({ useHandCursor: true });
    sliderHit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.setFortifyUnitsFromSlider(pointer.x, sliderX, sliderW, origin.fleetUnits, maxMovable);
    });
    sliderHit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.setFortifyUnitsFromSlider(pointer.x, sliderX, sliderW, origin.fleetUnits, maxMovable);
      }
    });
    this.drawButton(96, 676, 112, 34, "Cancel", () => {
      this.destinationSystemId = undefined;
      this.fortifyUnitsToMove = undefined;
      this.render();
    }, "ghost");
    this.drawButton(250, 676, 112, 34, "Redeploy", () => this.executeSelectedFortify(), "primary");
    this.drawRouteArrow(origin, destination, 0x7ee4ff);
  }

  private drawBottomSheet(height: number, accent: number) {
    const top = 720 - height;
    const isRedeployPanel = height <= 220;
    const centerX = isRedeployPanel ? 235 : 195;
    const width = isRedeployPanel ? 298 : 366;
    this.add.rectangle(centerX, top + height / 2, width, height - 10, 0x07131d, 0.92).setStrokeStyle(2.5, accent, 0.62).setDepth(58);
    this.add.rectangle(centerX, top + 4, width - 42, 2, accent, 0.28).setDepth(59);
  }

  private drawButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void, variant: "primary" | "secondary" | "ghost" = "primary") {
    const fill = variant === "primary" ? 0x66f2a8 : variant === "secondary" ? 0x0a2031 : 0x111c26;
    const stroke = variant === "primary" ? 0x23945e : variant === "secondary" ? 0x315a77 : 0x6f7f8c;
    const textColor = variant === "primary" ? "#06111e" : variant === "secondary" ? "#7ee4ff" : "#d9edf5";
    const button = this.add.rectangle(x + width / 2, y + height / 2, width, height, fill, variant === "primary" ? 0.95 : 0.82).setDepth(64);
    button.setStrokeStyle(2, stroke, 0.9).setInteractive({ useHandCursor: true });
    button.on("pointerdown", onClick);
    this.add
      .text(x + width / 2, y + height / 2, label, {
        color: textColor,
        fontFamily: "Inter, sans-serif",
        fontSize: height > 36 ? "16px" : "14px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(65);
  }

  private drawDebugLog(snapshot: GalaxySnapshot) {
    if (window.localStorage.getItem("odd-orbit:debug-galaxy-log") !== "true") {
      return;
    }

    snapshot.turnLog.slice(0, 5).forEach((entry, index) => {
      const palette = ownerPalette[entry.faction];
      this.add.circle(18, 612 + index * 16, 3, palette.fill, 0.92).setDepth(90);
      this.add
        .text(26, 606 + index * 16, entry.message, {
          color: "#9fb7c7",
          fontFamily: "Inter, sans-serif",
          fontSize: "8px",
          fontStyle: "700",
          wordWrap: { width: 338 }
        })
        .setDepth(90);
    });
  }

  private drawGameOver(snapshot: GalaxySnapshot) {
    const won = snapshot.gameOverStatus === "won";
    const color = won ? 0x66f2a8 : 0xff6d75;
    this.add.rectangle(195, 360, 390, 720, 0x07131d, 0.82).setDepth(200);
    this.add.circle(195, 304, 76, color, 0.2).setStrokeStyle(5, color, 0.8).setDepth(201);
    this.add
      .text(195, 346, won ? "Galaxy Secured" : "Faction Scattered", {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "24px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(202);
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
      const runInput = commitMoveOrder({
        originSystemId: attack.origin.id,
        destinationSystemId: attack.destination.id,
        unitsCommitted: 1
      });
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
    const effect = autoResolveStrategicBattle(attack.origin.id, attack.destination.id);
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
    this.animateRouteTransfer(origin, destination, "player", () => {
      this.strategyAnimationPlaying = false;
      this.activeAction = undefined;
      this.render();
    });
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
    this.playDirectionalAttackAnimation(origin, destination, {}, onComplete);
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
    const source = new Phaser.Math.Vector2(this.mapX(origin.x), this.mapY(origin.y));
    const target = new Phaser.Math.Vector2(this.mapX(destination.x), this.mapY(destination.y));
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
      const dot = this.add.circle(this.mapX(origin.x), this.mapY(origin.y), 3.8, color, 0.9).setDepth(120);
      this.tweens.add({
        targets: dot,
        x: this.mapX(destination.x),
        y: this.mapY(destination.y),
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
    const ring = this.add.circle(this.mapX(system.x), this.mapY(system.y), 22, color, 0.18).setStrokeStyle(4, color, 0.8).setDepth(120);
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
    const token = this.add.circle(this.mapX(system.x), this.mapY(system.y) - 34, 5, 0x66f2a8, 0.9).setStrokeStyle(1.5, 0xffffff, 0.72).setDepth(120);
    this.tweens.add({
      targets: token,
      y: this.mapY(system.y),
      alpha: 0,
      scale: 1.7,
      duration: 360,
      ease: "Cubic.easeIn",
      onComplete: () => token.destroy()
    });
  }

  private playInvalidTap(system: StarSystem) {
    const ring = this.add.circle(this.mapX(system.x), this.mapY(system.y), 20, 0x9aa8b5, 0.08).setStrokeStyle(2, 0x9aa8b5, 0.45).setDepth(90);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 1.45,
      duration: 180,
      onComplete: () => ring.destroy()
    });
  }

  private isSelectedRoute(firstId: string, secondId: string) {
    const origin = this.selectedSystemId;
    const destination = this.destinationSystemId;
    return Boolean(origin && destination && ((origin === firstId && destination === secondId) || (origin === secondId && destination === firstId)));
  }

  private isActionLane(firstId: string, secondId: string) {
    const origin = this.activeAction?.originSystemId;
    const destination = this.activeAction?.destinationSystemId;
    return Boolean(origin && destination && ((origin === firstId && destination === secondId) || (origin === secondId && destination === firstId)));
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
      return;
    }

    const visualOrigin = this.toVisualSystem(origin);
    const visualDestination = this.toVisualSystem(destination);
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

  private toVisualSystem(system: StarSystem): StarSystem {
    return {
      ...system,
      x: this.mapX(system.x),
      y: this.mapY(system.y)
    };
  }

  private systemType(system: StarSystem): SystemType {
    return system.systemType ?? "frontier";
  }
}

function shortFactionName(faction: FactionId) {
  switch (faction) {
    case "player":
      return "You";
    case "crimson":
      return "Crimson";
    case "amber":
      return "Amber";
    case "violet":
      return "Violet";
    case "neutral":
      return "Neutral";
  }
}

function compactActionLabel(action: GalaxyAction) {
  if (action.faction === "player" && action.title === "Redeploy") {
    return "MOVE";
  }
  if (action.title.toLowerCase().includes("captures")) {
    return `${shortFactionName(action.faction).toUpperCase()} CAPTURES`;
  }
  if (action.title.toLowerCase().includes("pressures")) {
    return "DEFENCE HOLDS";
  }
  if (action.title.toLowerCase().includes("reinforces")) {
    return `${shortFactionName(action.faction).toUpperCase()} +`;
  }
  return action.title.toUpperCase();
}
