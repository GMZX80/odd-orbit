import Phaser from "phaser";
import { estimateAutoIncursionChance, getFactionName, type getGalaxySnapshot } from "../systems/galaxyState";
import type { StarSystem } from "../systems/galaxyTypes";
import {
  GALAXY_COMMAND_MAP_CENTER_X,
  GALAXY_COMMAND_MAP_LEFT,
  GALAXY_COMMAND_MAP_RIGHT,
  GALAXY_COMMAND_NODE_DEPTH,
  GALAXY_COMMAND_TRAY_DEPTH,
  drawGalaxyCommandNode,
  drawGalaxyCommandPad,
  drawGalaxyCommandTray,
  drawGalaxyPhaseCommand
} from "./GalaxyButton";
import { GalaxyMapRenderer } from "./GalaxyMapRenderer";
import { ownerPalette } from "./ownerPalette";

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;

const MAP_WIDTH = GALAXY_COMMAND_MAP_RIGHT - GALAXY_COMMAND_MAP_LEFT;
const ATTACK_TRAY_W = 306;
const ATTACK_TRAY_H = 96;
const ATTACK_TRAY_X = GALAXY_COMMAND_MAP_LEFT + (MAP_WIDTH - ATTACK_TRAY_W) / 2;
const ATTACK_TRAY_Y = 608;
const ATTACK_COMMAND_Y = 660;
const ATTACK_CANCEL_X = GALAXY_COMMAND_MAP_CENTER_X - 100;
const ATTACK_PLAY_X = GALAXY_COMMAND_MAP_CENTER_X;
const ATTACK_AUTO_X = GALAXY_COMMAND_MAP_CENTER_X + 100;
const REDEPLOY_PANEL_W = 306;
const REDEPLOY_PANEL_H = 106;
const REDEPLOY_PANEL_X = GALAXY_COMMAND_MAP_LEFT + (MAP_WIDTH - REDEPLOY_PANEL_W) / 2;
const REDEPLOY_PANEL_Y = 602;
const REDEPLOY_PANEL_CX = REDEPLOY_PANEL_X + REDEPLOY_PANEL_W / 2;
const REDEPLOY_STEPPER_Y = REDEPLOY_PANEL_Y + 28;
const REDEPLOY_ACTION_Y = REDEPLOY_PANEL_Y + 78;
const REDEPLOY_CANCEL_X = GALAXY_COMMAND_MAP_CENTER_X - 114;
const REDEPLOY_ACTION_X = GALAXY_COMMAND_MAP_CENTER_X;
const REDEPLOY_END_X = GALAXY_COMMAND_MAP_CENTER_X + 114;
const COMMAND_NODE_DEPTH = GALAXY_COMMAND_NODE_DEPTH;
const SMALL_COMMAND_RADIUS = 33;
const MEDIUM_COMMAND_RADIUS = 36;
const LARGE_COMMAND_RADIUS = 40;
const STEPPER_BUTTON_W = 44;
const STEPPER_BUTTON_H = 34;
const STEPPER_VALUE_W = 98;
const STEPPER_VALUE_H = 34;
const ACTION_BUTTON_H = 38;

export interface GalaxyCommandPanelCallbacks {
  onSkipDeploy: () => void;
  onEndCommand: () => void;
  onEndFortify: () => void;
  onCancelSelection: () => void;
  onCancelDestination: () => void;
  onLaunchMove: () => void;
  onAutoResolveMove: () => void;
  onExecuteFortify: () => void;
  getFortifyUnits: (originUnits: number, maxMovable: number) => number;
  onAdjustFortifyUnits: (delta: number, originUnits: number, maxMovable: number) => void;
}

export interface DrawCommandPanelOptions {
  snapshot: GalaxySnapshot;
  selectedSystemId?: string;
  destinationSystemId?: string;
  callbacks: GalaxyCommandPanelCallbacks;
}

export class GalaxyCommandPanel {
  private commandObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: GalaxyMapRenderer
  ) {}

  draw(options: DrawCommandPanelOptions) {
    this.clearCommandControls();
    const origin = options.snapshot.systems.find((system) => system.id === options.selectedSystemId);
    const destination = options.snapshot.systems.find((system) => system.id === options.destinationSystemId);

    if (options.snapshot.turnPhase === "deploy") {
      this.track(drawGalaxyPhaseCommand(this.scene, "Skip", options.callbacks.onSkipDeploy));
      return;
    }

    if (options.snapshot.turnPhase === "command") {
      if (origin && destination) {
        this.drawAttackChoice(origin, destination, options.callbacks);
        return;
      }
      this.track(drawGalaxyPhaseCommand(this.scene, "End Turn", options.callbacks.onEndCommand));
      if (origin) {
        this.track(
          drawGalaxyCommandNode({
            scene: this.scene,
            x: GALAXY_COMMAND_MAP_LEFT + 38,
            y: 654,
            radius: 30,
            label: "Cancel",
            variant: "neutral",
            depth: COMMAND_NODE_DEPTH,
            onActivate: options.callbacks.onCancelSelection
          })
        );
      }
      return;
    }

    if (options.snapshot.turnPhase === "fortify") {
      if (origin && destination) {
        this.drawRedeployPanel(origin, destination, options.callbacks);
        return;
      }
      this.track(drawGalaxyPhaseCommand(this.scene, "End Redeploy", options.callbacks.onEndFortify));
      if (origin) {
        this.track(
          drawGalaxyCommandNode({
            scene: this.scene,
            x: GALAXY_COMMAND_MAP_LEFT + 38,
            y: 654,
            radius: 30,
            label: "Cancel",
            variant: "neutral",
            depth: COMMAND_NODE_DEPTH,
            onActivate: options.callbacks.onCancelSelection
          })
        );
      }
      return;
    }

    if (options.snapshot.turnPhase === "npcTurn") {
      const palette = ownerPalette[options.snapshot.currentFaction];
      this.drawMiniStatus(24, 675, getFactionName(options.snapshot.currentFaction), palette.fill);
    }
  }

  private drawAttackChoice(origin: StarSystem, destination: StarSystem, callbacks: GalaxyCommandPanelCallbacks) {
    const odds = Math.round(estimateAutoIncursionChance(origin.id, destination.id) * 100);
    this.track(drawGalaxyCommandTray({ scene: this.scene, x: ATTACK_TRAY_X, y: ATTACK_TRAY_Y, width: ATTACK_TRAY_W, height: ATTACK_TRAY_H, accent: 0x66f2a8 }));
    this.track(
      drawGalaxyCommandNode({
        scene: this.scene,
        x: ATTACK_CANCEL_X,
        y: ATTACK_COMMAND_Y,
        radius: SMALL_COMMAND_RADIUS,
        label: "Cancel",
        variant: "neutral",
        depth: COMMAND_NODE_DEPTH,
        onActivate: callbacks.onCancelDestination
      })
    );
    this.track(
      drawGalaxyCommandNode({
        scene: this.scene,
        x: ATTACK_PLAY_X,
        y: ATTACK_COMMAND_Y,
        radius: LARGE_COMMAND_RADIUS,
        label: "Play",
        variant: "primary",
        depth: COMMAND_NODE_DEPTH,
        onActivate: callbacks.onLaunchMove
      })
    );
    this.track(
      drawGalaxyCommandNode({
        scene: this.scene,
        x: ATTACK_AUTO_X,
        y: ATTACK_COMMAND_Y,
        radius: MEDIUM_COMMAND_RADIUS,
        label: "Auto",
        subLabel: `${odds}%`,
        variant: "secondary",
        depth: COMMAND_NODE_DEPTH,
        onActivate: callbacks.onAutoResolveMove
      })
    );
    this.mapRenderer.drawAttackPreview(origin, destination, odds / 100);
    this.mapRenderer.drawRouteArrow(origin, destination, 0x66f2a8);
  }

  private drawRedeployPanel(origin: StarSystem, destination: StarSystem, callbacks: GalaxyCommandPanelCallbacks) {
    const maxMovable = Math.max(1, origin.fleetUnits - 1);
    const units = callbacks.getFortifyUnits(origin.fleetUnits, maxMovable);

    this.track(drawGalaxyCommandTray({ scene: this.scene, x: REDEPLOY_PANEL_X, y: REDEPLOY_PANEL_Y, width: REDEPLOY_PANEL_W, height: REDEPLOY_PANEL_H, accent: 0x7ee4ff }));
    this.trackObject(this.scene.add.rectangle(REDEPLOY_PANEL_CX, REDEPLOY_PANEL_Y + 10, 74, 3, 0x7ee4ff, 0.42).setDepth(GALAXY_COMMAND_TRAY_DEPTH + 1));

    this.drawStepperValue(units);
    this.track(
      drawGalaxyCommandPad({
        scene: this.scene,
        x: REDEPLOY_PANEL_CX - 82,
        y: REDEPLOY_STEPPER_Y,
        width: STEPPER_BUTTON_W,
        height: STEPPER_BUTTON_H,
        label: "-",
        variant: "secondary",
        enabled: units > 1,
        depth: COMMAND_NODE_DEPTH,
        onActivate: () => callbacks.onAdjustFortifyUnits(-1, origin.fleetUnits, maxMovable)
      })
    );
    this.track(
      drawGalaxyCommandPad({
        scene: this.scene,
        x: REDEPLOY_PANEL_CX + 82,
        y: REDEPLOY_STEPPER_Y,
        width: STEPPER_BUTTON_W,
        height: STEPPER_BUTTON_H,
        label: "+",
        variant: "secondary",
        enabled: units < maxMovable,
        depth: COMMAND_NODE_DEPTH,
        onActivate: () => callbacks.onAdjustFortifyUnits(1, origin.fleetUnits, maxMovable)
      })
    );
    this.track(
      drawGalaxyCommandPad({
        scene: this.scene,
        x: REDEPLOY_CANCEL_X,
        y: REDEPLOY_ACTION_Y,
        width: 74,
        height: ACTION_BUTTON_H,
        label: "Cancel",
        variant: "neutral",
        depth: COMMAND_NODE_DEPTH,
        onActivate: callbacks.onCancelDestination
      })
    );
    this.track(
      drawGalaxyCommandPad({
        scene: this.scene,
        x: REDEPLOY_ACTION_X,
        y: REDEPLOY_ACTION_Y,
        width: 106,
        height: ACTION_BUTTON_H + 2,
        label: "Redeploy",
        variant: "primary",
        depth: COMMAND_NODE_DEPTH,
        onActivate: callbacks.onExecuteFortify
      })
    );
    this.track(
      drawGalaxyCommandPad({
        scene: this.scene,
        x: REDEPLOY_END_X,
        y: REDEPLOY_ACTION_Y,
        width: 74,
        height: ACTION_BUTTON_H,
        label: "End",
        variant: "secondary",
        depth: COMMAND_NODE_DEPTH,
        onActivate: callbacks.onEndFortify
      })
    );
    this.mapRenderer.drawRouteArrow(origin, destination, 0x7ee4ff);
  }

  private drawStepperValue(units: number) {
    const graphics = this.trackObject(this.scene.add.graphics().setDepth(COMMAND_NODE_DEPTH - 2));
    graphics.fillStyle(0x081723, 0.92);
    graphics.fillRoundedRect(REDEPLOY_PANEL_CX - STEPPER_VALUE_W / 2, REDEPLOY_STEPPER_Y - STEPPER_VALUE_H / 2, STEPPER_VALUE_W, STEPPER_VALUE_H, 9);
    graphics.lineStyle(2, 0x7ee4ff, 0.42);
    graphics.strokeRoundedRect(REDEPLOY_PANEL_CX - STEPPER_VALUE_W / 2, REDEPLOY_STEPPER_Y - STEPPER_VALUE_H / 2, STEPPER_VALUE_W, STEPPER_VALUE_H, 9);
    this.trackObject(
      this.scene.add
        .text(REDEPLOY_PANEL_CX, REDEPLOY_STEPPER_Y, String(units), {
          color: "#f7fbff",
          fontFamily: "Inter, sans-serif",
          fontSize: "18px",
          fontStyle: "900"
        })
        .setOrigin(0.5)
        .setStroke("#06111e", 2)
        .setDepth(COMMAND_NODE_DEPTH - 1)
    );
  }

  private track(objects: Phaser.GameObjects.GameObject[]) {
    this.commandObjects.push(...objects);
  }

  private trackObject<T extends Phaser.GameObjects.GameObject>(object: T) {
    this.commandObjects.push(object);
    return object;
  }

  private clearCommandControls() {
    for (const object of this.commandObjects) {
      if (object.active) {
        object.destroy();
      }
    }
    this.commandObjects = [];
  }

  private drawMiniStatus(x: number, y: number, text: string, color: number) {
    this.scene.add.circle(x, y + 9, 6, color, 0.9).setDepth(61);
    this.scene.add
      .text(x + 13, y, text, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        fontStyle: "900"
      })
      .setDepth(61);
  }
}
