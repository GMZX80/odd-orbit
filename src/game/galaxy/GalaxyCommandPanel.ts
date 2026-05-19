import Phaser from "phaser";
import { estimateAutoIncursionChance, getFactionName, type getGalaxySnapshot } from "../systems/galaxyState";
import type { StarSystem } from "../systems/galaxyTypes";
import { drawBottomSheet, drawGalaxyButton } from "./GalaxyButton";
import { GalaxyMapRenderer } from "./GalaxyMapRenderer";
import { ownerPalette } from "./ownerPalette";

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;

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
  onSetFortifyUnitsFromSlider: (pointerX: number, sliderX: number, sliderW: number, originUnits: number, maxMovable: number) => void;
}

export interface DrawCommandPanelOptions {
  snapshot: GalaxySnapshot;
  selectedSystemId?: string;
  destinationSystemId?: string;
  callbacks: GalaxyCommandPanelCallbacks;
}

export class GalaxyCommandPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: GalaxyMapRenderer
  ) {}

  draw(options: DrawCommandPanelOptions) {
    const origin = options.snapshot.systems.find((system) => system.id === options.selectedSystemId);
    const destination = options.snapshot.systems.find((system) => system.id === options.destinationSystemId);

    if (options.snapshot.turnPhase === "deploy") {
      drawGalaxyButton(this.scene, 318, 674, 50, 28, "Skip", options.callbacks.onSkipDeploy);
      return;
    }

    if (options.snapshot.turnPhase === "command") {
      if (origin && destination) {
        this.drawAttackChoice(origin, destination, options.callbacks);
        return;
      }
      drawGalaxyButton(this.scene, 302, 674, 66, 28, "End", options.callbacks.onEndCommand);
      if (origin) {
        drawGalaxyButton(this.scene, 22, 674, 68, 28, "Cancel", options.callbacks.onCancelSelection);
      }
      return;
    }

    if (options.snapshot.turnPhase === "fortify") {
      if (origin && destination) {
        this.drawRedeployPanel(origin, destination, options.callbacks);
        return;
      }
      drawGalaxyButton(this.scene, 306, 674, 62, 28, "End", options.callbacks.onEndFortify);
      if (origin) {
        drawGalaxyButton(this.scene, 22, 674, 68, 28, "Cancel", options.callbacks.onCancelSelection);
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
    const dockX = 92;
    const dockY = 632;
    const dockW = 282;
    const dockH = 58;
    this.scene.add.rectangle(dockX + dockW / 2, dockY + dockH / 2, dockW, dockH, 0x07131d, 0.82).setStrokeStyle(1.8, 0x66f2a8, 0.42).setDepth(58);
    drawGalaxyButton(this.scene, 108, 648, 64, 30, "Cancel", callbacks.onCancelDestination, "ghost");
    drawGalaxyButton(this.scene, 184, 642, 76, 40, "Play", callbacks.onLaunchMove, "primary");
    drawGalaxyButton(this.scene, 272, 648, 84, 30, `Auto ${odds}%`, callbacks.onAutoResolveMove, "secondary");
    this.mapRenderer.drawAttackPreview(origin, destination, odds / 100);
    this.mapRenderer.drawRouteArrow(origin, destination, 0x66f2a8);
  }

  private drawRedeployPanel(origin: StarSystem, destination: StarSystem, callbacks: GalaxyCommandPanelCallbacks) {
    const maxMovable = Math.max(1, origin.fleetUnits - 1);
    const units = callbacks.getFortifyUnits(origin.fleetUnits, maxMovable);
    const panelCx = 235;
    const sliderX = 108;
    const sliderY = 638;
    const sliderW = 254;
    const ratio = maxMovable <= 1 ? 1 : (units - 1) / (maxMovable - 1);

    drawBottomSheet(this.scene, 148, 0x7ee4ff);
    this.scene.add.rectangle(panelCx, 579, 34, 4, 0x7ee4ff, 0.72).setDepth(59);
    this.scene.add
      .text(panelCx - 36, 596, origin.name, {
        color: "#ffe66f",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "900"
      })
      .setOrigin(1, 0.5)
      .setDepth(72);
    this.scene.add
      .text(panelCx, 596, "->", {
        color: "#66f2a8",
        fontFamily: "Inter, sans-serif",
        fontSize: "15px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(72);
    this.scene.add
      .text(panelCx + 36, 596, destination.name, {
        color: "#66f2a8",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "900"
      })
      .setOrigin(0, 0.5)
      .setDepth(72);
    this.scene.add
      .text(panelCx, 624, `${units} units`, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "28px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(72);

    this.scene.add.rectangle(sliderX + sliderW / 2, sliderY + 15, sliderW, 6, 0x24445b, 0.9).setDepth(72);
    this.scene.add.rectangle(sliderX + (sliderW * ratio) / 2, sliderY + 15, Math.max(4, sliderW * ratio), 6, 0x66f2a8, 0.96).setDepth(73);
    this.scene.add.circle(sliderX + sliderW * ratio, sliderY + 15, 12, 0xf7fbff, 0.98).setStrokeStyle(2, 0x7ee4ff, 0.9).setDepth(74);
    const sliderHit = this.scene.add.rectangle(sliderX + sliderW / 2, sliderY, sliderW + 16, 34, 0xffffff, 0).setDepth(75);
    sliderHit.setInteractive({ useHandCursor: true });
    sliderHit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      callbacks.onSetFortifyUnitsFromSlider(pointer.x, sliderX, sliderW, origin.fleetUnits, maxMovable);
    });
    sliderHit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        callbacks.onSetFortifyUnitsFromSlider(pointer.x, sliderX, sliderW, origin.fleetUnits, maxMovable);
      }
    });
    drawGalaxyButton(this.scene, 96, 676, 78, 34, "Cancel", callbacks.onCancelDestination, "ghost");
    drawGalaxyButton(this.scene, 190, 676, 94, 34, "Redeploy", callbacks.onExecuteFortify, "primary");
    drawGalaxyButton(this.scene, 300, 676, 64, 34, "End", callbacks.onEndFortify, "secondary");
    this.mapRenderer.drawRouteArrow(origin, destination, 0x7ee4ff);
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
