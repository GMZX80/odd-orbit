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
  endPlayerTurn,
  estimateStrategicBattleOdds,
  executeFortify,
  executeNextNpcTurn,
  finishNpcRound,
  getFactionName,
  getGalaxySnapshot,
  skipCommand,
  skipDeployment
} from "../systems/galaxyState";
import { factionThemes } from "../systems/factionTheme";
import type { Constellation, FactionId, GalaxyAction, StarSystem, TurnPhase } from "../systems/galaxyTypes";

const ownerPalette: Record<FactionId, { fill: number; stroke: number; label: string }> = {
  player: { fill: factionThemes.player.mapFill, stroke: factionThemes.player.mapStroke, label: factionThemes.player.label },
  crimson: { fill: factionThemes.crimson.mapFill, stroke: factionThemes.crimson.mapStroke, label: factionThemes.crimson.label },
  amber: { fill: factionThemes.amber.mapFill, stroke: factionThemes.amber.mapStroke, label: factionThemes.amber.label },
  violet: { fill: factionThemes.violet.mapFill, stroke: factionThemes.violet.mapStroke, label: factionThemes.violet.label },
  neutral: { fill: factionThemes.neutral.mapFill, stroke: factionThemes.neutral.mapStroke, label: factionThemes.neutral.label }
};

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;

export class GalaxyMapScene extends Phaser.Scene {
  private selectedSystemId?: string;
  private destinationSystemId?: string;
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

  private render() {
    this.children.removeAll(true);
    const snapshot = getGalaxySnapshot();
    this.drawBackground();
    this.drawConstellations(snapshot.systems, snapshot.constellations);
    this.drawPhaseHud(snapshot);
    this.drawStarlanes(snapshot.systems);
    this.drawSystems(snapshot);
    this.drawContextPrompt(snapshot);
    this.drawActionBadge(snapshot);
    this.drawCommandStrip(snapshot);
    this.drawDebugLog(snapshot);
    if (snapshot.turnPhase === "gameOver") {
      this.drawGameOver(snapshot);
    }
    this.maybeProcessNpcTurn();
  }

  private drawBackground() {
    for (let index = 0; index < 116; index += 1) {
      const x = (index * 97) % 390;
      const y = (index * 173) % 720;
      const alpha = 0.12 + ((index * 19) % 50) / 115;
      const radius = 0.6 + ((index * 11) % 16) / 11;
      this.add.circle(x, y, radius, 0xd9f7ff, alpha).setDepth(0);
    }

    this.add.circle(340, 110, 76, 0x18436b, 0.16).setDepth(0);
    this.add.circle(34, 640, 92, 0x3f1d55, 0.16).setDepth(0);
  }

  private drawConstellations(systems: StarSystem[], constellations: Constellation[]) {
    for (const constellation of constellations) {
      const members = systems.filter((system) => system.constellationId === constellation.id);
      if (members.length === 0) {
        continue;
      }

      const minX = Math.min(...members.map((system) => system.x));
      const maxX = Math.max(...members.map((system) => system.x));
      const minY = Math.min(...members.map((system) => system.y));
      const maxY = Math.max(...members.map((system) => system.y));
      const x = (minX + maxX) / 2;
      const y = (minY + maxY) / 2;
      const width = Math.max(78, maxX - minX + 74);
      const height = Math.max(64, maxY - minY + 58);

      this.add.ellipse(x, y, width, height, constellation.tint, 0.04).setStrokeStyle(1, constellation.tint, 0.1).setDepth(0.5);
    }
  }

  private drawPhaseHud(snapshot: GalaxySnapshot) {
    const phaseColor = phaseTint(snapshot.turnPhase, snapshot.currentFaction);
    this.add.rectangle(195, 38, 366, 62, 0x07131d, 0.8).setStrokeStyle(2, phaseColor, 0.62).setDepth(50);
    this.add
      .text(20, 13, `Round ${snapshot.turnNumber} - ${shortFactionName(snapshot.currentFaction)}`, {
        color: "#9fd3e8",
        fontFamily: "Inter, sans-serif",
        fontSize: "10px",
        fontStyle: "800"
      })
      .setDepth(51);

    this.add
      .text(20, 27, this.phaseHudText(snapshot), {
        color: "#ffe66f",
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        fontStyle: "900"
      })
      .setStroke("#56213b", 4)
      .setDepth(51);

    this.add
      .text(356, 21, this.phasePrompt(snapshot), {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "900"
      })
      .setOrigin(1, 0)
      .setDepth(51);

    this.drawTinyFactionLegend();
  }

  private phaseHudText(snapshot: GalaxySnapshot) {
    switch (snapshot.turnPhase) {
      case "deploy":
        return `DEPLOY ${snapshot.deploymentUnitsRemaining}`;
      case "command":
        return "ATTACK";
      case "fortify":
        return "FORTIFY";
      case "npcTurn":
        return "ENEMY TURN";
      case "gameOver":
        return snapshot.gameOverStatus === "won" ? "SECURED" : "SCATTERED";
    }
  }

  private phasePrompt(snapshot: GalaxySnapshot) {
    if (this.arrivalEffectPlaying) {
      return "Resolving";
    }
    if (this.strategyAnimationPlaying) {
      return this.activeAction ? compactActionLabel(this.activeAction) : "Moving";
    }
    switch (snapshot.turnPhase) {
      case "deploy":
        return snapshot.deploymentUnitsRemaining > 0 ? "Tap blue sectors" : "Attack ready";
      case "command":
        if (this.destinationSystemId) {
          return "Play or Auto";
        }
        if (this.selectedSystemId) {
          return "Choose target";
        }
        return "Choose origin";
      case "fortify":
        if (this.selectedSystemId) {
          return "Choose blue neighbour";
        }
        return "Move or End";
      case "npcTurn":
        return "Enemy moving";
      case "gameOver":
        return snapshot.gameOverStatus === "won" ? "Galaxy secured" : "No systems left";
    }
  }

  private drawTinyFactionLegend() {
    const factions: FactionId[] = ["player", "crimson", "amber", "violet", "neutral"];
    factions.forEach((faction, index) => {
      const x = 22 + index * 18;
      const palette = ownerPalette[faction];
      this.add.circle(x, 60, 4, palette.fill, 0.9).setStrokeStyle(1, palette.stroke, 0.82).setDepth(51);
    });
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
        const alpha = isActionLane ? 0.92 : isSelectedRoute ? 0.68 : 0.26;
        const width = isActionLane ? 5 : isSelectedRoute ? 4 : 2;
        const line = this.add.line(0, 0, system.x, system.y, neighbour.x, neighbour.y, color, alpha);
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
      const x = Phaser.Math.Linear(origin.x, destination.x, t);
      const y = Phaser.Math.Linear(origin.y, destination.y, t);
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
      const radius = system.systemType === "core" ? 16 : system.systemType === "fortress" ? 15 : 13;

      this.drawCueHalo(system, radius, cue, time);
      if (isSelected || isDestination || isActionEndpoint) {
        const color = isActionEndpoint ? 0xffe66f : isSelected ? 0xffe66f : 0x66f2a8;
        this.add.circle(system.x, system.y, radius + 13, color, 0.14).setStrokeStyle(3, color, 0.78).setDepth(3);
      }

      const body = this.add.circle(system.x, system.y, radius, palette.fill, 0.93).setStrokeStyle(3, palette.stroke, 0.95).setDepth(5);
      body.setInteractive({ useHandCursor: true });
      body.on("pointerdown", () => this.handleSystemClick(system.id));

      this.add.circle(system.x - radius * 0.32, system.y - radius * 0.35, Math.max(2.4, radius * 0.18), 0xffffff, 0.56).setDepth(6);
      this.add
        .text(system.x, system.y - 2, String(system.fleetUnits), {
          color: "#06111e",
          fontFamily: "Inter, sans-serif",
          fontSize: "12px",
          fontStyle: "900"
        })
        .setOrigin(0.5)
        .setDepth(7);
      this.add
        .text(system.x, system.y + radius + 6, system.name, {
          color: "#f7fbff",
          fontFamily: "Inter, sans-serif",
          fontSize: "9px",
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
    this.add.circle(system.x, system.y, (radius + 10) * scale, color, alpha * 0.5).setStrokeStyle(2.2, color, alpha).setDepth(2);
  }

  private drawContextPrompt(snapshot: GalaxySnapshot) {
    if (snapshot.turnPhase === "gameOver" || this.arrivalEffectPlaying || this.strategyAnimationPlaying) {
      return;
    }

    const prompt = this.phasePrompt(snapshot);
    const origin = snapshot.systems.find((system) => system.id === this.selectedSystemId);
    const destination = snapshot.systems.find((system) => system.id === this.destinationSystemId);
    const point =
      origin && destination
        ? {
            x: Phaser.Math.Clamp((origin.x + destination.x) / 2, 68, 322),
            y: Phaser.Math.Clamp((origin.y + destination.y) / 2 - 34, 102, 610)
          }
        : origin
          ? { x: Phaser.Math.Clamp(origin.x, 68, 322), y: Phaser.Math.Clamp(origin.y - 46, 102, 610) }
          : { x: 195, y: 92 };

    const width = Phaser.Math.Clamp(prompt.length * 7.4 + 28, 102, 210);
    this.add.rectangle(point.x, point.y, width, 27, 0x07131d, 0.82).setStrokeStyle(1.5, phaseTint(snapshot.turnPhase, snapshot.currentFaction), 0.56).setDepth(35);
    this.add
      .text(point.x, point.y, prompt, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(36);
  }

  private drawActionBadge(snapshot: GalaxySnapshot) {
    if (!this.activeAction || this.arrivalEffectPlaying) {
      return;
    }

    const origin = snapshot.systems.find((system) => system.id === this.activeAction?.originSystemId);
    const destination = snapshot.systems.find((system) => system.id === this.activeAction?.destinationSystemId);
    const color = ownerPalette[this.activeAction.faction].fill;
    const x = origin && destination ? Phaser.Math.Clamp((origin.x + destination.x) / 2, 80, 310) : Phaser.Math.Clamp(origin?.x ?? 195, 80, 310);
    const y = origin && destination ? Phaser.Math.Clamp((origin.y + destination.y) / 2 - 22, 98, 610) : Phaser.Math.Clamp((origin?.y ?? 180) - 42, 98, 610);
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
      this.drawMiniStatus(24, 676, `+${snapshot.deploymentUnitsRemaining}`, 0x66f2a8);
      return;
    }

    if (snapshot.turnPhase === "command") {
      this.drawButton(302, 674, 66, 28, "End", () => {
        skipCommand();
        this.clearSelection();
        this.render();
      });
      if (origin && destination) {
        this.drawAttackChoice(origin, destination);
      } else if (origin) {
        this.drawButton(22, 674, 68, 28, "Cancel", () => {
          this.clearSelection();
          this.render();
        });
      }
      return;
    }

    if (snapshot.turnPhase === "fortify") {
      this.drawButton(306, 674, 62, 28, "End", () => {
        endPlayerTurn();
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
    const x = Phaser.Math.Clamp(destination.x - 82, 12, 210);
    const y = Phaser.Math.Clamp(destination.y - 86, 96, 584);
    const attackers = Math.max(0, origin.fleetUnits - 1);
    const odds = Math.round(estimateStrategicBattleOdds(origin.id, destination.id) * 100);
    this.add.rectangle(x + 86, y + 42, 172, 84, 0x07131d, 0.9).setStrokeStyle(2, 0x66f2a8, 0.78).setDepth(60);
    this.add
      .text(x + 86, y + 8, `${origin.fleetUnits} vs ${destination.fleetUnits}`, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        fontStyle: "900"
      })
      .setOrigin(0.5, 0)
      .setDepth(62);
    this.drawButton(x + 10, y + 30, 66, 28, "Play", () => this.launchMove());
    this.drawButton(x + 96, y + 30, 66, 28, "Auto", () => this.autoResolveMove());
    this.add
      .text(x + 43, y + 61, "Seed 1", choiceCaptionStyle())
      .setOrigin(0.5, 0)
      .setDepth(62);
    this.add
      .text(x + 129, y + 61, `${attackers}v${destination.fleetUnits} ~${odds}%`, choiceCaptionStyle())
      .setOrigin(0.5, 0)
      .setDepth(62);
    this.drawRouteArrow(origin, destination, 0x66f2a8);
  }

  private drawRouteArrow(origin: StarSystem, destination: StarSystem, color: number) {
    const angle = Phaser.Math.Angle.Between(origin.x, origin.y, destination.x, destination.y);
    const arrowX = Phaser.Math.Linear(origin.x, destination.x, 0.62);
    const arrowY = Phaser.Math.Linear(origin.y, destination.y, 0.62);
    const arrow = this.add.triangle(arrowX, arrowY, 0, -5, 11, 0, 0, 5, color, 0.86);
    arrow.setRotation(angle);
    arrow.setDepth(8);
  }

  private drawMiniStatus(x: number, y: number, text: string, color: number) {
    this.add.circle(x, y + 9, 6, color, 0.9).setDepth(41);
    this.add
      .text(x + 13, y, text, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        fontStyle: "900"
      })
      .setDepth(41);
  }

  private drawButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void) {
    const button = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x66f2a8, 0.95).setDepth(64);
    button.setStrokeStyle(2, 0x23945e, 0.9).setInteractive({ useHandCursor: true });
    button.on("pointerdown", onClick);
    this.add
      .text(x + width / 2, y + height / 2, label, {
        color: "#06111e",
        fontFamily: "Inter, sans-serif",
        fontSize: "10.5px",
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
      const unitsToMove = Math.max(1, selected.fleetUnits - 1);
      if (canFortifyMove(selected.id, system.id, unitsToMove) && executeFortify(selected.id, system.id, unitsToMove)) {
        this.activeAction = {
          title: "Redeploy",
          detail: `${unitsToMove}`,
          faction: "player",
          originSystemId: selected.id,
          destinationSystemId: system.id
        };
        this.clearSelection();
        this.strategyAnimationPlaying = true;
        this.render();
        this.animateRouteTransfer(selected, system, "player", () => {
          endPlayerTurn();
          this.strategyAnimationPlaying = false;
          this.activeAction = undefined;
          this.render();
        });
      }
      return;
    }

    if (system.owner === "player") {
      this.selectedSystemId = system.fleetUnits > 1 ? system.id : undefined;
      this.destinationSystemId = undefined;
      this.render();
      return;
    }

    this.playInvalidTap(system);
  }

  private launchMove() {
    const runInput = this.commitSelectedAttack();
    if (runInput) {
      gameEvents.emit("galaxy:start-run", runInput);
    }
  }

  private autoResolveMove() {
    if (!this.selectedSystemId || !this.destinationSystemId) {
      return;
    }

    const effect = autoResolveStrategicBattle(this.selectedSystemId, this.destinationSystemId);
    if (effect) {
      this.clearSelection();
      this.render();
      this.playPendingArrivalEffect();
    }
  }

  private commitSelectedAttack() {
    if (!this.selectedSystemId || !this.destinationSystemId) {
      return undefined;
    }

    const seedUnitsCommitted = 1;
    if (!canCreateMoveOrder(this.selectedSystemId, this.destinationSystemId, seedUnitsCommitted)) {
      return undefined;
    }

    const runInput = commitMoveOrder({
      originSystemId: this.selectedSystemId,
      destinationSystemId: this.destinationSystemId,
      unitsCommitted: seedUnitsCommitted
    });
    if (runInput) {
      this.clearSelection();
    }
    return runInput;
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
      const dot = this.add.circle(origin.x, origin.y, 3.8, color, 0.9).setDepth(120);
      this.tweens.add({
        targets: dot,
        x: destination.x,
        y: destination.y,
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
    const ring = this.add.circle(system.x, system.y, 22, color, 0.18).setStrokeStyle(4, color, 0.8).setDepth(120);
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
    const token = this.add.circle(system.x, system.y - 34, 5, 0x66f2a8, 0.9).setStrokeStyle(1.5, 0xffffff, 0.72).setDepth(120);
    this.tweens.add({
      targets: token,
      y: system.y,
      alpha: 0,
      scale: 1.7,
      duration: 360,
      ease: "Cubic.easeIn",
      onComplete: () => token.destroy()
    });
  }

  private playInvalidTap(system: StarSystem) {
    const ring = this.add.circle(system.x, system.y, 20, 0x9aa8b5, 0.08).setStrokeStyle(2, 0x9aa8b5, 0.45).setDepth(90);
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
  }

  private playPendingArrivalEffect() {
    const effect = consumePendingStrategicArrivalEffect();
    if (!effect) {
      return;
    }

    const snapshot = getGalaxySnapshot();
    const origin = snapshot.systems.find((system) => system.id === effect.originSystemId);
    const destination = snapshot.systems.find((system) => system.id === effect.destinationSystemId);
    if (!origin || !destination) {
      return;
    }

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
          origin,
          destination,
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

function phaseTint(phase: TurnPhase, faction: FactionId) {
  if (phase === "deploy") {
    return 0x66f2a8;
  }
  if (phase === "command") {
    return 0xffe66f;
  }
  if (phase === "fortify") {
    return 0x7ee4ff;
  }
  if (phase === "npcTurn") {
    return ownerPalette[faction].fill;
  }
  return 0xf7fbff;
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

function choiceCaptionStyle() {
  return {
    color: "#9fd3e8",
    fontFamily: "Inter, sans-serif",
    fontSize: "8.5px",
    fontStyle: "900"
  };
}
