import Phaser from "phaser";
import { TRAVEL_LANES, TRAVEL_ROAD } from "./travelConfig";
import { travelLaneCenterX, travelRoadWidthAtY } from "./travelGeometry";

interface TravelLaneGuideUpdate {
  chargeProgress: number;
  elapsedMs: number;
  selectedLane: number;
  timeMs: number;
  wormholeOpen: boolean;
}

const laneRoles = [
  { label: "CHARGE", color: 0x65ffcb, accent: 0x8ddcff },
  { label: "FIGHT", color: 0xff6d75, accent: 0xffb066 },
  { label: "GROW", color: 0x7ee4ff, accent: 0xffe66f }
] as const;

export class TravelLaneGuide {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[];
  private readonly cueText: Phaser.GameObjects.Text;
  private impactPulse = 0;
  private selectionPulse = 0;
  private previousSelectedLane: number = TRAVEL_LANES.center;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(45);
    this.labels = laneRoles.map((role, lane) =>
      scene.add
        .text(this.labelX(lane), TRAVEL_ROAD.playerY + 46, role.label, {
          color: `#${role.accent.toString(16).padStart(6, "0")}`,
          fontFamily: "Inter, sans-serif",
          fontSize: "11px",
          fontStyle: "900"
        })
        .setOrigin(0.5)
        .setStroke("#06111e", 4)
        .setDepth(100)
    );
    this.cueText = scene.add
      .text(82, TRAVEL_ROAD.playerY - 108, "Charge the wormhole", {
        color: "#b3fff3",
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setStroke("#06111e", 5)
      .setDepth(930);
  }

  update(options: TravelLaneGuideUpdate, deltaSeconds: number) {
    if (options.selectedLane !== this.previousSelectedLane) {
      this.selectionPulse = 1;
      this.previousSelectedLane = options.selectedLane;
    }

    this.impactPulse = Math.max(0, this.impactPulse - deltaSeconds * 2.8);
    this.selectionPulse = Math.max(0, this.selectionPulse - deltaSeconds * 3.4);
    this.graphics.clear();
    this.drawLaneBands(options);
    this.drawLaneDividers();
    this.drawWormholeConduit(options);
    this.drawCenterTargeting(options);
    this.drawCardLaneMotifs(options);
    this.updateLabels(options);
    this.updateCue(options);
  }

  pulseWormholeImpact() {
    this.impactPulse = 1;
  }

  destroy() {
    this.graphics.destroy();
    for (const label of this.labels) {
      label.destroy();
    }
    this.cueText.destroy();
  }

  private drawLaneBands(options: TravelLaneGuideUpdate) {
    for (let lane = 0; lane < TRAVEL_LANES.count; lane += 1) {
      const role = laneRoles[lane];
      const selected = options.selectedLane === lane;
      const pulse = selected ? this.selectionPulse : 0;
      const alpha = selected ? 0.12 + pulse * 0.08 : 0.045;
      const bottomWidth = travelRoadWidthAtY(TRAVEL_ROAD.bottomY);
      const topWidth = travelRoadWidthAtY(TRAVEL_ROAD.horizonY + 30);
      const bottomLeft = TRAVEL_ROAD.centerX - bottomWidth / 2 + (bottomWidth / TRAVEL_LANES.count) * lane;
      const bottomRight = bottomLeft + bottomWidth / TRAVEL_LANES.count;
      const topLeft = TRAVEL_ROAD.centerX - topWidth / 2 + (topWidth / TRAVEL_LANES.count) * lane;
      const topRight = topLeft + topWidth / TRAVEL_LANES.count;

      this.graphics.fillStyle(role.color, alpha);
      this.graphics.fillPoints(
        [
          new Phaser.Geom.Point(topLeft, TRAVEL_ROAD.horizonY + 30),
          new Phaser.Geom.Point(topRight, TRAVEL_ROAD.horizonY + 30),
          new Phaser.Geom.Point(bottomRight, TRAVEL_ROAD.bottomY),
          new Phaser.Geom.Point(bottomLeft, TRAVEL_ROAD.bottomY)
        ],
        true
      );
    }
  }

  private drawLaneDividers() {
    for (let lane = 1; lane < TRAVEL_LANES.count; lane += 1) {
      const bottomWidth = travelRoadWidthAtY(TRAVEL_ROAD.bottomY);
      const topWidth = travelRoadWidthAtY(TRAVEL_ROAD.horizonY + 30);
      const bottomX = TRAVEL_ROAD.centerX - bottomWidth / 2 + (bottomWidth / TRAVEL_LANES.count) * lane;
      const topX = TRAVEL_ROAD.centerX - topWidth / 2 + (topWidth / TRAVEL_LANES.count) * lane;

      this.graphics.lineStyle(1.4, 0xd9f7ff, 0.11);
      this.graphics.lineBetween(topX, TRAVEL_ROAD.horizonY + 30, bottomX, TRAVEL_ROAD.bottomY);
    }
  }

  private drawWormholeConduit(options: TravelLaneGuideUpdate) {
    const charge = options.wormholeOpen ? 1 : options.chargeProgress;
    const selectedBoost = options.selectedLane === TRAVEL_LANES.left ? 0.14 : 0;
    const pulse = 0.5 + Math.sin(options.timeMs * 0.008) * 0.5;
    const alpha = 0.22 + charge * 0.34 + this.impactPulse * 0.34 + selectedBoost;
    const topX = travelLaneCenterX(TRAVEL_LANES.left, 360);
    const bottomX = travelLaneCenterX(TRAVEL_LANES.left, TRAVEL_ROAD.playerY);

    this.graphics.lineStyle(4 + charge * 5 + this.impactPulse * 6, 0x65ffcb, alpha);
    this.graphics.beginPath();
    this.graphics.moveTo(bottomX, TRAVEL_ROAD.playerY + 18);
    this.graphics.lineTo(Phaser.Math.Linear(bottomX, topX, 0.5), 510);
    this.graphics.lineTo(topX, 380);
    this.graphics.strokePath();

    for (let index = 0; index < 5; index += 1) {
      const y = Phaser.Math.Linear(585, 398, ((options.timeMs * 0.00038 + index / 5) % 1));
      const x = Phaser.Math.Linear(bottomX, topX, (585 - y) / 187) + Math.sin(options.timeMs * 0.004 + index) * 5;
      this.graphics.fillStyle(index % 2 === 0 ? 0xb3fff3 : 0x65ffcb, 0.18 + charge * 0.32 + pulse * 0.12);
      this.graphics.fillCircle(x, y, 2.2 + charge * 2.2 + this.impactPulse * 2.4);
    }
  }

  private drawCenterTargeting(options: TravelLaneGuideUpdate) {
    const selected = options.selectedLane === TRAVEL_LANES.center;
    const alpha = selected ? 0.4 + this.selectionPulse * 0.22 : 0.18;
    const centerX = travelLaneCenterX(TRAVEL_LANES.center, TRAVEL_ROAD.playerY);

    this.graphics.lineStyle(selected ? 3 : 2, 0xff6d75, alpha);
    this.graphics.lineBetween(centerX, TRAVEL_ROAD.playerY + 18, travelLaneCenterX(TRAVEL_LANES.center, TRAVEL_ROAD.horizonY + 70), TRAVEL_ROAD.horizonY + 70);
    this.graphics.lineStyle(1.5, 0xffb066, alpha * 0.65);
    this.graphics.strokeCircle(centerX, TRAVEL_ROAD.playerY - 42, 18 + this.selectionPulse * 10);
  }

  private drawCardLaneMotifs(options: TravelLaneGuideUpdate) {
    const selected = options.selectedLane === TRAVEL_LANES.card;
    const alpha = selected ? 0.34 + this.selectionPulse * 0.24 : 0.16;
    const x = travelLaneCenterX(TRAVEL_LANES.card, TRAVEL_ROAD.playerY);

    for (let index = 0; index < 3; index += 1) {
      const y = TRAVEL_ROAD.playerY - 108 + index * 48;
      const wobble = Math.sin(options.timeMs * 0.003 + index) * 3;
      this.graphics.lineStyle(2, index % 2 === 0 ? 0x7ee4ff : 0xffe66f, alpha);
      this.graphics.strokeRoundedRect(x - 19 + wobble, y, 38, 28, 6);
    }
  }

  private updateLabels(options: TravelLaneGuideUpdate) {
    for (let lane = 0; lane < this.labels.length; lane += 1) {
      const label = this.labels[lane];
      const selected = options.selectedLane === lane;
      label.setPosition(this.labelX(lane), TRAVEL_ROAD.playerY + 46);
      label.setAlpha(selected ? 0.96 : 0.48);
      label.setScale(selected ? 1 + this.selectionPulse * 0.08 : 1);
    }
  }

  private updateCue(options: TravelLaneGuideUpdate) {
    const cueWindow = Phaser.Math.Clamp(1 - Math.max(0, options.elapsedMs - 1800) / 3600, 0, 1);
    const chargeNeed = Phaser.Math.Clamp(1 - options.chargeProgress * 1.7, 0, 1);
    const alpha = cueWindow * chargeNeed;

    this.cueText.setAlpha(alpha);
    this.cueText.setPosition(82, TRAVEL_ROAD.playerY - 108);
  }

  private labelX(lane: number) {
    return Phaser.Math.Clamp(travelLaneCenterX(lane, TRAVEL_ROAD.playerY + 34), 54, 336);
  }
}
