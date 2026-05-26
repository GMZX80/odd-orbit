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
  { color: 0x65ffcb, accent: 0x8ddcff },
  { color: 0xff6d75, accent: 0xffb066 },
  { color: 0x7ee4ff, accent: 0xffe66f }
] as const;

export class TravelLaneGuide {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private impactPulse = 0;
  private selectionPulse = 0;
  private previousSelectedLane: number = TRAVEL_LANES.center;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(45);
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
    this.drawLaneRoleIcons(options);
    this.drawWormholeCue(options);
  }

  pulseWormholeImpact() {
    this.impactPulse = 1;
  }

  destroy() {
    this.graphics.destroy();
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

  private drawLaneRoleIcons(options: TravelLaneGuideUpdate) {
    const iconY = TRAVEL_ROAD.playerY + 48;
    this.drawWormholeIcon(this.labelX(TRAVEL_LANES.left), iconY, options);
    this.drawCrosshairIcon(this.labelX(TRAVEL_LANES.center), iconY, options);
    this.drawCardsIcon(this.labelX(TRAVEL_LANES.card), iconY, options);
  }

  private drawWormholeCue(options: TravelLaneGuideUpdate) {
    const cueWindow = Phaser.Math.Clamp(1 - Math.max(0, options.elapsedMs - 1800) / 3600, 0, 1);
    const chargeNeed = Phaser.Math.Clamp(1 - options.chargeProgress * 1.7, 0, 1);
    const alpha = cueWindow * chargeNeed;
    if (alpha <= 0) {
      return;
    }

    const wormholeX = travelLaneCenterX(TRAVEL_LANES.left, 360);
    const shipLaneX = travelLaneCenterX(TRAVEL_LANES.left, TRAVEL_ROAD.playerY);
    const pulse = 0.5 + Math.sin(options.timeMs * 0.012) * 0.5;
    const arrowY = TRAVEL_ROAD.playerY - 96 + pulse * 16;

    this.graphics.lineStyle(3, 0xb3fff3, alpha * 0.72);
    this.graphics.lineBetween(shipLaneX, arrowY + 28, Phaser.Math.Linear(shipLaneX, wormholeX, 0.5), 496);
    this.graphics.lineBetween(Phaser.Math.Linear(shipLaneX, wormholeX, 0.5), 496, wormholeX, 386);
    this.graphics.fillStyle(0xb3fff3, alpha * 0.92);
    this.graphics.fillTriangle(shipLaneX, arrowY, shipLaneX - 10, arrowY + 20, shipLaneX + 10, arrowY + 20);
  }

  private labelX(lane: number) {
    return Phaser.Math.Clamp(travelLaneCenterX(lane, TRAVEL_ROAD.playerY + 34), 54, 336);
  }

  private drawWormholeIcon(x: number, y: number, options: TravelLaneGuideUpdate) {
    const selected = options.selectedLane === TRAVEL_LANES.left;
    const alpha = selected ? 0.88 : 0.48;
    const pulse = selected ? this.selectionPulse * 5 : 0;

    this.graphics.lineStyle(2.2, 0x65ffcb, alpha);
    this.graphics.strokeCircle(x, y, 13 + pulse);
    this.graphics.lineStyle(1.4, 0x8ddcff, alpha * 0.75);
    this.graphics.strokeCircle(x, y, 7 + pulse * 0.4);
  }

  private drawCrosshairIcon(x: number, y: number, options: TravelLaneGuideUpdate) {
    const selected = options.selectedLane === TRAVEL_LANES.center;
    const alpha = selected ? 0.88 : 0.48;
    const radius = 12 + (selected ? this.selectionPulse * 5 : 0);

    this.graphics.lineStyle(2, 0xff6d75, alpha);
    this.graphics.strokeCircle(x, y, radius);
    this.graphics.lineStyle(1.8, 0xffb066, alpha * 0.82);
    this.graphics.lineBetween(x - 19, y, x - 7, y);
    this.graphics.lineBetween(x + 7, y, x + 19, y);
    this.graphics.lineBetween(x, y - 19, x, y - 7);
    this.graphics.lineBetween(x, y + 7, x, y + 19);
  }

  private drawCardsIcon(x: number, y: number, options: TravelLaneGuideUpdate) {
    const selected = options.selectedLane === TRAVEL_LANES.card;
    const alpha = selected ? 0.88 : 0.48;
    const lift = selected ? this.selectionPulse * 4 : 0;

    for (let index = 0; index < 3; index += 1) {
      this.graphics.lineStyle(1.8, index % 2 === 0 ? 0x7ee4ff : 0xffe66f, alpha - index * 0.1);
      this.graphics.strokeRoundedRect(x - 14 + index * 5, y - 11 - index * 3 - lift, 23, 17, 4);
    }
  }
}
