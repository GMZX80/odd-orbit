import Phaser from "phaser";
import { playSwarmStabilisationEffect } from "../effects/SwarmStabilisationEffect";
import { gameEvents } from "../events";
import { GalaxyCommandPanel } from "../galaxy/GalaxyCommandPanel";
import { GalaxyMapRenderer } from "../galaxy/GalaxyMapRenderer";
import { GalaxyStrategicAnimator } from "../galaxy/GalaxyStrategicAnimator";
import { toVisualSystem } from "../galaxy/mapLayout";
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
import type { GalaxyAction, StarSystem, StrategicArrivalEffect } from "../systems/galaxyTypes";

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;

export class GalaxyMapScene extends Phaser.Scene {
  private readonly mapRenderer: GalaxyMapRenderer;
  private readonly commandPanel: GalaxyCommandPanel;
  private readonly animator: GalaxyStrategicAnimator;
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
    this.animator = new GalaxyStrategicAnimator(this);
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
    this.cameras.main.resetFX();
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
    this.mapRenderer.drawGalaxyMap({
      snapshot,
      selectedSystemId: this.selectedSystemId,
      destinationSystemId: this.destinationSystemId,
      activeAction: this.activeAction,
      arrivalEffectPlaying: this.arrivalEffectPlaying,
      strategyAnimationPlaying: this.strategyAnimationPlaying,
      cinematicMode,
      onSystemClick: (systemId) => this.handleSystemClick(systemId),
      drawCommandPanel: () => this.drawCommandPanel(snapshot),
      drawPhaseHud: () => drawPhaseHud(this, snapshot)
    });
    this.maybeProcessNpcTurn();
  }

  private shouldRefreshIdleVisuals() {
    if (this.arrivalEffectPlaying || this.strategyAnimationPlaying || this.input.activePointer.isDown) {
      return false;
    }
    if (this.selectedSystemId || this.destinationSystemId) {
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
        onEndFortify: () => this.endFortifyPhase(),
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
        onAdjustFortifyUnits: (delta, originUnits, maxMovable) => {
          const currentUnits = this.normalizedFortifyUnits(originUnits, maxMovable);
          this.setFortifyUnits(currentUnits + delta, maxMovable);
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
      this.animator.animateRouteTransfer({
        origin,
        destination,
        faction: "player",
        onComplete: () => {
          this.strategyAnimationPlaying = false;
          this.activeAction = undefined;
          this.render();
        }
      });
    } catch (error) {
      console.error("Redeploy animation failed", error);
      this.strategyAnimationPlaying = false;
      this.activeAction = undefined;
      this.render();
    }
  }

  private endFortifyPhase() {
    const ended = finishFortifyPhase();
    this.clearSelection();

    if (!ended) {
      console.warn("Unable to end fortify phase", getGalaxySnapshot());
    }

    this.render();
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
      this.animator.playDirectionalAttack({ origin, destination, onComplete });
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
      this.animator.animateRouteTransfer({ origin, destination, faction: action.faction, onComplete });
      return;
    }
    if (origin) {
      this.animator.pulseSystem({ system: origin, color: ownerPalette[action.faction].fill, onComplete });
      return;
    }
    this.time.delayedCall(520, onComplete);
  }

  private playDeployDrop(systemId: string) {
    const system = getGalaxySnapshot().systems.find((candidate) => candidate.id === systemId);
    if (!system) {
      return;
    }
    this.animator.playDeployDrop(system);
  }

  private playInvalidTap(system: StarSystem) {
    this.animator.playInvalidTap(system);
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
