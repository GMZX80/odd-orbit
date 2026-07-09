import Phaser from "phaser";
import { TRAVEL_LANES, TRAVEL_ROAD } from "./travelConfig";

export function travelRoadWidthAtY(y: number) {
  const progress = Phaser.Math.Clamp((y - TRAVEL_ROAD.horizonY) / (TRAVEL_ROAD.bottomY - TRAVEL_ROAD.horizonY), 0, 1);
  return Phaser.Math.Linear(TRAVEL_ROAD.topWidth, TRAVEL_ROAD.bottomWidth, progress);
}

export function travelScaleAtY(y: number) {
  const progress = Phaser.Math.Clamp((y - TRAVEL_ROAD.horizonY) / (TRAVEL_ROAD.bottomY - TRAVEL_ROAD.horizonY), 0, 1);
  return Phaser.Math.Linear(0.34, 1.18, progress);
}

export function travelLaneCenterX(lane: number, y: number) {
  const width = travelRoadWidthAtY(y);
  const left = TRAVEL_ROAD.centerX - width / 2;
  return left + ((lane + 0.5) / TRAVEL_LANES.count) * width;
}

export function applyTravelPerspective(body: Phaser.GameObjects.Container, lane: number, y: number, xOffset = 0) {
  const scale = travelScaleAtY(y);
  body.x = travelLaneCenterX(lane, y) + xOffset * scale;
  body.y = y;
  body.setScale(scale);
  body.setDepth(Math.floor(y));
}

export function travelPointerLane(x: number, y: number) {
  const width = travelRoadWidthAtY(y);
  const left = TRAVEL_ROAD.centerX - width / 2;
  return Math.floor(((x - left) / width) * TRAVEL_LANES.count);
}

export function closestPointOnSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSquared = abx * abx + aby * aby;
  if (abLengthSquared === 0) {
    return { x: ax, y: ay };
  }

  const t = Phaser.Math.Clamp(((px - ax) * abx + (py - ay) * aby) / abLengthSquared, 0, 1);
  return {
    x: ax + abx * t,
    y: ay + aby * t
  };
}

export function travelDefenceLineY(playerY: number = TRAVEL_ROAD.playerY) {
  return playerY - 10;
}

export function travelBroodCoreRuptureY(height: number = TRAVEL_ROAD.bottomY) {
  return Phaser.Math.Clamp(height * 0.32, TRAVEL_ROAD.horizonY + 120, height * 0.42);
}

export function travelWormholeRestPosition(width: number = 390, height: number = 720) {
  return new Phaser.Math.Vector2(Phaser.Math.Clamp(width * 0.22, 72, 108), Phaser.Math.Clamp(height * 0.53, 330, 430));
}
