import Phaser from "phaser";
import { playSwarmStabilisationEffect } from "../effects/SwarmStabilisationEffect";
import { gameEvents } from "../events";
import {
  canCreateMoveOrder,
  canFortifyMove,
  commitMoveOrder,
  consumePendingStrategicArrivalEffect,
  deployToSystem,
  endPlayerTurn,
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

export class GalaxyMapScene extends Phaser.Scene {
  private selectedSystemId?: string;
  private destinationSystemId?: string;
  private unitsToSend = 0;
  private npcProcessing = false;
  private arrivalEffectPlaying = false;
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
    this.drawHeader(snapshot.turnNumber, snapshot.turnPhase, snapshot.currentFaction, snapshot.deploymentUnitsRemaining);
    this.drawStarlanes(snapshot.systems);
    this.drawSystems(snapshot.systems);
    this.drawPanel(snapshot);
    this.maybeProcessNpcTurn();
  }

  private drawBackground() {
    for (let index = 0; index < 110; index += 1) {
      const x = (index * 97) % 390;
      const y = (index * 173) % 720;
      const alpha = 0.14 + ((index * 19) % 50) / 100;
      const radius = 0.6 + ((index * 11) % 16) / 10;
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

      this.add.ellipse(x, y, width, height, constellation.tint, 0.045).setStrokeStyle(1, constellation.tint, 0.12).setDepth(0.5);
      this.add
        .text(x, minY - 16, constellation.name, {
          color: "#8da7b7",
          fontFamily: "Inter, sans-serif",
          fontSize: "9px",
          fontStyle: "800"
        })
        .setOrigin(0.5)
        .setDepth(1);
    }
  }

  private drawHeader(turnNumber: number, phase: TurnPhase, faction: FactionId, deployments: number) {
    this.add
      .text(15, 14, "Odd Orbit", {
        color: "#ffe66f",
        fontFamily: "Inter, sans-serif",
        fontSize: "28px",
        fontStyle: "900"
      })
      .setStroke("#56213b", 5)
      .setDepth(30);

    this.add
      .text(18, 50, `Round ${turnNumber}  |  ${phaseLabel(phase)}  |  ${getFactionName(faction)}`, {
        color: "#d9edf5",
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "800"
      })
      .setDepth(30);

    if (phase === "deploy") {
      this.add
        .text(276, 18, `Deploy ${deployments}`, {
          color: "#66f2a8",
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          fontStyle: "900"
        })
        .setDepth(30);
    }

    this.drawLegend();
  }

  private drawLegend() {
    const factions: FactionId[] = ["player", "crimson", "amber", "violet", "neutral"];
    factions.forEach((faction, index) => {
      const x = 26 + index * 70;
      const palette = ownerPalette[faction];
      this.add.circle(x, 76, 5, palette.fill, 0.92).setStrokeStyle(1.2, palette.stroke, 0.9).setDepth(30);
      this.add
        .text(x + 8, 71, palette.label, {
          color: "#9fb7c7",
          fontFamily: "Inter, sans-serif",
          fontSize: "9px",
          fontStyle: "800"
        })
        .setDepth(30);
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

        const isSelectedLane = this.selectedSystemId === system.id || this.selectedSystemId === neighbour.id;
        const isActionLane = this.isActionLane(system.id, neighbour.id);
        const color = isActionLane ? 0xffe66f : isSelectedLane ? 0x7ee4ff : 0x4c6478;
        const alpha = isActionLane ? 0.9 : isSelectedLane ? 0.62 : 0.28;
        const line = this.add.line(0, 0, system.x, system.y, neighbour.x, neighbour.y, color, alpha);
        line.setOrigin(0, 0).setLineWidth(isActionLane ? 5 : isSelectedLane ? 3 : 2).setDepth(isActionLane ? 4 : 1);
      }
    }
  }

  private drawSystems(systems: StarSystem[]) {
    const selected = systems.find((system) => system.id === this.selectedSystemId);

    for (const system of systems) {
      const palette = ownerPalette[system.owner];
      const isSelected = system.id === this.selectedSystemId;
      const isDestination = system.id === this.destinationSystemId;
      const isValidTarget = this.isValidTarget(system, selected);
      const isActionEndpoint = system.id === this.activeAction?.originSystemId || system.id === this.activeAction?.destinationSystemId;
      const radius = system.systemType === "core" ? 16 : system.systemType === "fortress" ? 15 : 13;

      if (isValidTarget) {
        this.add.circle(system.x, system.y, radius + 10, 0x66f2a8, 0.12).setStrokeStyle(2, 0x66f2a8, 0.52).setDepth(2);
      }
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

  private drawPanel(snapshot: ReturnType<typeof getGalaxySnapshot>) {
    const panelY = 574;
    const origin = snapshot.systems.find((system) => system.id === this.selectedSystemId);
    const destination = snapshot.systems.find((system) => system.id === this.destinationSystemId);
    const title = this.panelTitle(snapshot.turnPhase, origin, destination, snapshot.lastResolution?.title);
    const detail = this.panelDetail(snapshot.turnPhase, origin, destination, snapshot);

    this.add.rectangle(195, 646, 366, 142, 0x07131d, 0.86).setStrokeStyle(2, 0x34546c, 0.82).setDepth(40);
    this.add
      .text(24, panelY, title, {
        color: snapshot.turnPhase === "gameOver" ? "#ffe66f" : "#8ee7ff",
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        fontStyle: "900"
      })
      .setDepth(41);
    this.add
      .text(24, panelY + 19, detail, {
        color: "#d9edf5",
        fontFamily: "Inter, sans-serif",
        fontSize: "10px",
        fontStyle: "700",
        wordWrap: { width: 342 }
      })
      .setDepth(41);

    if (this.arrivalEffectPlaying) {
      return;
    }

    this.drawPhaseControls(snapshot.turnPhase, origin, destination);
    this.drawTurnLog(snapshot.turnLog);
  }

  private drawPhaseControls(phase: TurnPhase, origin: StarSystem | undefined, destination: StarSystem | undefined) {
    const movableUnits = origin ? Math.max(0, origin.fleetUnits - 1) : 0;

    if (phase === "deploy") {
      this.drawButton(28, 674, 118, 28, "Finish Deploy", () => {
        skipDeployment();
        this.clearSelection();
        this.render();
      });
      return;
    }

    if (phase === "command") {
      if (origin && destination && movableUnits > 0) {
        this.drawButton(28, 674, 126, 28, "Launch Incursion", () => this.launchMove());
        this.drawButton(164, 674, 64, 28, "Cancel", () => {
          this.destinationSystemId = undefined;
          this.render();
        });
      }
      this.drawButton(294, 674, 68, 28, "Skip", () => {
        skipCommand();
        this.clearSelection();
        this.render();
      });
      return;
    }

    if (phase === "fortify") {
      if (origin && destination && movableUnits > 0) {
        this.drawButton(28, 674, 36, 28, "-", () => this.adjustUnits(-1));
        this.drawButton(68, 674, 36, 28, "+", () => this.adjustUnits(1));
        this.drawButton(112, 674, 104, 28, "Fortify", () => this.fortifyMove());
      }
      this.drawButton(250, 674, 112, 28, "End Turn", () => {
        endPlayerTurn();
        this.clearSelection();
        this.render();
      });
    }
  }

  private drawTurnLog(log: { message: string; faction: FactionId }[]) {
    log.slice(0, 3).forEach((entry, index) => {
      const palette = ownerPalette[entry.faction];
      this.add.circle(30, 626 + index * 14, 3, palette.fill, 0.92).setDepth(41);
      this.add
        .text(38, 620 + index * 14, entry.message, {
          color: "#9fb7c7",
          fontFamily: "Inter, sans-serif",
          fontSize: "8.5px",
          fontStyle: "700",
          wordWrap: { width: 318 }
        })
        .setDepth(41);
    });
  }

  private drawButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void) {
    const button = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x66f2a8, 0.95).setDepth(44);
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
      .setDepth(45);
  }

  private handleSystemClick(systemId: string) {
    if (this.arrivalEffectPlaying) {
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
      deployToSystem(system.id);
      this.clearSelection();
      this.render();
      return;
    }

    if (!selected) {
      if (system.owner === "player") {
        this.selectedSystemId = system.id;
        this.destinationSystemId = undefined;
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
      this.selectedSystemId = system.id;
      this.destinationSystemId = undefined;
      this.unitsToSend = 0;
      this.render();
      return;
    }

    if (selected.neighbours.includes(system.id)) {
      this.destinationSystemId = system.id;
      this.unitsToSend = 1;
      this.render();
    }
  }

  private handleFortifyClick(system: StarSystem, selected: StarSystem) {
    if (system.owner === "player" && selected.neighbours.includes(system.id)) {
      this.destinationSystemId = system.id;
      this.unitsToSend = Math.max(1, selected.fleetUnits - 1);
      this.render();
      return;
    }

    if (system.owner === "player") {
      this.selectedSystemId = system.id;
      this.destinationSystemId = undefined;
      this.render();
    }
  }

  private adjustUnits(delta: number) {
    const { systems } = getGalaxySnapshot();
    const origin = systems.find((system) => system.id === this.selectedSystemId);
    if (!origin) {
      return;
    }
    this.unitsToSend = Phaser.Math.Clamp(this.unitsToSend + delta, 1, Math.max(1, origin.fleetUnits - 1));
    this.render();
  }

  private launchMove() {
    if (!this.selectedSystemId || !this.destinationSystemId) {
      return;
    }

    const seedUnitsCommitted = 1;
    if (!canCreateMoveOrder(this.selectedSystemId, this.destinationSystemId, seedUnitsCommitted)) {
      return;
    }

    const runInput = commitMoveOrder({
      originSystemId: this.selectedSystemId,
      destinationSystemId: this.destinationSystemId,
      unitsCommitted: seedUnitsCommitted
    });

    if (runInput) {
      gameEvents.emit("galaxy:start-run", runInput);
    }
  }

  private fortifyMove() {
    if (!this.selectedSystemId || !this.destinationSystemId) {
      return;
    }

    if (canFortifyMove(this.selectedSystemId, this.destinationSystemId, this.unitsToSend)) {
      executeFortify(this.selectedSystemId, this.destinationSystemId, this.unitsToSend);
      this.clearSelection();
      this.render();
    }
  }

  private maybeProcessNpcTurn() {
    const snapshot = getGalaxySnapshot();
    if (snapshot.turnPhase !== "npcTurn" || this.npcProcessing) {
      return;
    }

    this.npcProcessing = true;
    this.time.delayedCall(680, () => {
      const { action, completedRound } = executeNextNpcTurn();
      this.activeAction = action;
      this.render();
      this.time.delayedCall(920, () => {
        this.npcProcessing = false;
        if (completedRound) {
          this.activeAction = undefined;
          finishNpcRound();
        }
        this.render();
      });
    });
  }

  private isValidTarget(system: StarSystem, selected: StarSystem | undefined) {
    if (!selected || system.id === selected.id) {
      return false;
    }
    const phase = getGalaxySnapshot().turnPhase;
    if (!selected.neighbours.includes(system.id)) {
      return false;
    }
    if (phase === "command") {
      return selected.owner === "player" && selected.fleetUnits > 1 && system.owner !== "player";
    }
    if (phase === "fortify") {
      return selected.owner === "player" && system.owner === "player";
    }
    return false;
  }

  private isActionLane(firstId: string, secondId: string) {
    const origin = this.activeAction?.originSystemId;
    const destination = this.activeAction?.destinationSystemId;
    return Boolean(origin && destination && ((origin === firstId && destination === secondId) || (origin === secondId && destination === firstId)));
  }

  private panelTitle(phase: TurnPhase, origin: StarSystem | undefined, destination: StarSystem | undefined, fallback: string | undefined) {
    if (origin && destination) {
      if (phase === "command") {
        return `Incursion: ${origin.name} -> ${destination.name}`;
      }
      if (phase === "fortify") {
        return `Redeploy: ${origin.name} -> ${destination.name}`;
      }
      return `${origin.name} -> ${destination.name}`;
    }
    if (origin) {
      return `${origin.name} selected`;
    }
    return fallback ?? phaseLabel(phase);
  }

  private panelDetail(
    phase: TurnPhase,
    origin: StarSystem | undefined,
    destination: StarSystem | undefined,
    snapshot: ReturnType<typeof getGalaxySnapshot>
  ) {
    if (snapshot.gameOverStatus === "won") {
      return "Every system in the known galaxy is under your faction's control.";
    }
    if (snapshot.gameOverStatus === "lost") {
      return "Your faction has no remaining star systems.";
    }
    if (this.arrivalEffectPlaying) {
      return snapshot.lastResolution?.detail ?? "The crossing swarm is arriving at the destination sector.";
    }
    if (phase === "deploy") {
      return `Tap blue systems to place deployments. Remaining: ${snapshot.deploymentUnitsRemaining}.`;
    }
    if (phase === "npcTurn") {
      return snapshot.lastResolution?.detail ?? `${getFactionName(snapshot.currentFaction)} is taking a turn.`;
    }
    if (origin && destination) {
      if (origin.fleetUnits <= 1) {
        return `${origin.name} must keep one fleet unit behind before anything can move.`;
      }
      if (phase === "command") {
        return `Incursion: 1 seed unit will cross the starlane. Survivors from the wormhole run will populate or challenge ${destination.name}.`;
      }
      return `${this.unitsToSend} fleet units selected. This redeploys instantly between owned sectors.`;
    }
    if (origin) {
      return phase === "fortify"
        ? "Select a connected blue system to redeploy fleet units."
        : "Select a connected non-blue sector for a one-seed incursion. Blue neighbours can be redeployed during Fortify.";
    }
    return snapshot.lastResolution?.detail ?? "Select a blue system.";
  }

  private clearSelection() {
    this.selectedSystemId = undefined;
    this.destinationSystemId = undefined;
    this.unitsToSend = 0;
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
      title: "Swarm Stabilising",
      detail: "The crossing swarm is condensing into settled fleet strength.",
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

function phaseLabel(phase: TurnPhase) {
  switch (phase) {
    case "deploy":
      return "Deploy";
    case "command":
      return "Command";
    case "fortify":
      return "Fortify";
    case "npcTurn":
      return "NPC Turn";
    case "gameOver":
      return "Game Over";
  }
}
