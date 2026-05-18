import Phaser from "phaser";
import { getSystemTypeTraits, type SystemType } from "../systems/systemTypeTraits";
import type { getGalaxySnapshot } from "../systems/galaxyState";
import type { Constellation, GalaxyAction, StarSystem, FactionId } from "../systems/galaxyTypes";
import { mapX, mapY } from "./mapLayout";
import { ownerPalette } from "./ownerPalette";

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;
type SystemCue = "none" | "deploy" | "attack-origin" | "attack-target" | "fortify-origin" | "fortify-target";

export interface DrawSystemsOptions {
  snapshot: GalaxySnapshot;
  selectedSystemId?: string;
  destinationSystemId?: string;
  activeAction?: GalaxyAction;
  arrivalEffectPlaying: boolean;
  strategyAnimationPlaying: boolean;
  onSystemClick: (systemId: string) => void;
}

export interface DrawLaneOptions {
  systems: StarSystem[];
  selectedSystemId?: string;
  destinationSystemId?: string;
  activeAction?: GalaxyAction;
}

export interface DrawActionBadgeOptions {
  snapshot: GalaxySnapshot;
  activeAction?: GalaxyAction;
  arrivalEffectPlaying: boolean;
}

export class GalaxyMapRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

  drawCinematicShade() {
    this.scene.add.rectangle(195, 360, 390, 720, 0x020913, 0.34).setDepth(20);
  }

  drawBackground() {
    for (let index = 0; index < 116; index += 1) {
      const x = (index * 97) % 390;
      const y = (index * 173) % 720;
      const alpha = 0.12 + ((index * 19) % 50) / 115;
      const radius = 0.6 + ((index * 11) % 16) / 11;
      this.scene.add.circle(x, y, radius, 0xd9f7ff, alpha).setDepth(0);
    }

    this.scene.add.circle(340, 110, 76, 0x18436b, 0.1).setDepth(0);
    this.scene.add.circle(34, 640, 92, 0x3f1d55, 0.1).setDepth(0);
  }

  drawConstellations(systems: StarSystem[], constellations: Constellation[], turnPhase: GalaxySnapshot["turnPhase"]) {
    for (const constellation of constellations) {
      const members = systems.filter((system) => system.constellationId === constellation.id);
      if (members.length === 0) {
        continue;
      }

      const minX = Math.min(...members.map((system) => mapX(system.x)));
      const maxX = Math.max(...members.map((system) => mapX(system.x)));
      const minY = Math.min(...members.map((system) => mapY(system.y)));
      const maxY = Math.max(...members.map((system) => mapY(system.y)));
      const x = (minX + maxX) / 2;
      const y = (minY + maxY) / 2;
      const width = Math.max(78, maxX - minX + 74);
      const height = Math.max(64, maxY - minY + 58);

      this.scene.add.ellipse(x, y, width, height, constellation.tint, 0.025).setStrokeStyle(1, constellation.tint, 0.06).setDepth(0.5);
      if (turnPhase === "deploy" && members.every((system) => system.owner === "player")) {
        this.drawConstellationBonusPulse(x, y, width, height, constellation.tint);
      }
    }
  }

  drawStarlanes(options: DrawLaneOptions) {
    const byId = new Map(options.systems.map((system) => [system.id, system]));
    const drawn = new Set<string>();

    for (const system of options.systems) {
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

        const isSelectedRoute = this.isSelectedRoute(system.id, neighbour.id, options.selectedSystemId, options.destinationSystemId);
        const isActionLane = this.isActionLane(system.id, neighbour.id, options.activeAction);
        const color = isActionLane ? 0xffe66f : isSelectedRoute ? 0x66f2a8 : 0x4c6478;
        const alpha = isActionLane ? 0.92 : isSelectedRoute ? 0.72 : 0.16;
        const width = isActionLane ? 5 : isSelectedRoute ? 4 : 2.2;
        const line = this.scene.add.line(0, 0, mapX(system.x), mapY(system.y), mapX(neighbour.x), mapY(neighbour.y), color, alpha);
        line.setOrigin(0, 0).setLineWidth(width).setDepth(isActionLane || isSelectedRoute ? 4 : 1);

        if (isActionLane || isSelectedRoute) {
          this.drawRouteMotion(system, neighbour, color, isActionLane ? 5 : 4);
        }
      }
    }
  }

  drawSystems(options: DrawSystemsOptions) {
    const selected = options.snapshot.systems.find((system) => system.id === options.selectedSystemId);
    const time = this.scene.time.now;

    for (const system of options.snapshot.systems) {
      const palette = ownerPalette[system.owner];
      const cue = this.systemCue(options, system, selected);
      const isSelected = system.id === options.selectedSystemId;
      const isDestination = system.id === options.destinationSystemId;
      const isActionEndpoint = system.id === options.activeAction?.originSystemId || system.id === options.activeAction?.destinationSystemId;
      const radius = system.systemType === "core" ? 19 : system.systemType === "fortress" ? 18 : 16;
      const isFocused = isSelected || isDestination || isActionEndpoint;

      this.drawCueHalo(system, radius, cue, time);
      if (isSelected || isDestination || isActionEndpoint) {
        const color = isActionEndpoint ? 0xffe66f : isSelected ? 0xffe66f : 0x66f2a8;
        this.scene.add.circle(mapX(system.x), mapY(system.y), radius + 18, color, 0.1).setStrokeStyle(5, color, 0.3).setDepth(2.8);
        this.scene.add.circle(mapX(system.x), mapY(system.y), radius + 11, color, 0.18).setStrokeStyle(3, color, 0.9).setDepth(3);
      }
      this.drawSystemTypeVisual(system, radius, time, isFocused ? 1.25 : 1);

      const body = this.scene.add.circle(mapX(system.x), mapY(system.y), radius, palette.fill, 0.93).setStrokeStyle(3, palette.stroke, 0.95).setDepth(5);
      body.setInteractive({ useHandCursor: true });
      body.on("pointerdown", () => options.onSystemClick(system.id));

      this.scene.add.circle(mapX(system.x) - radius * 0.32, mapY(system.y) - radius * 0.35, Math.max(2.4, radius * 0.18), 0xffffff, 0.56).setDepth(6);
      this.scene.add
        .text(mapX(system.x), mapY(system.y) - 2, String(system.fleetUnits), {
          color: "#06111e",
          fontFamily: "Inter, sans-serif",
          fontSize: "15px",
          fontStyle: "900"
        })
        .setOrigin(0.5)
        .setStroke("#f7fbff", 1.8)
        .setDepth(7);
      this.scene.add
        .text(mapX(system.x), mapY(system.y) + radius + 6, system.name, {
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

  drawDeployProductionEffects(snapshot: GalaxySnapshot) {
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

      const type = this.systemType(system);
      const source = this.productionSourcePoint(system, type, this.scene.time.now);
      const color = type === "mining" ? 0xffd45f : 0x9ee7ff;
      this.drawProductionPulse(source, phaseTarget, color, type === "mining" ? 0.18 : 0, this.scene.time.now);
    }
  }

  drawActionBadge(options: DrawActionBadgeOptions) {
    if (!options.activeAction || options.arrivalEffectPlaying) {
      return;
    }

    const origin = options.snapshot.systems.find((system) => system.id === options.activeAction?.originSystemId);
    const destination = options.snapshot.systems.find((system) => system.id === options.activeAction?.destinationSystemId);
    const color = ownerPalette[options.activeAction.faction].fill;
    const x =
      origin && destination
        ? Phaser.Math.Clamp((mapX(origin.x) + mapX(destination.x)) / 2, 80, 330)
        : Phaser.Math.Clamp(origin ? mapX(origin.x) : 195, 80, 330);
    const y =
      origin && destination
        ? Phaser.Math.Clamp((mapY(origin.y) + mapY(destination.y)) / 2 - 22, 98, 610)
        : Phaser.Math.Clamp(origin ? mapY(origin.y) : 180, 98, 610);
    const label = compactActionLabel(options.activeAction);

    this.scene.add.rectangle(x, y, Math.max(110, label.length * 7.2 + 24), 30, 0x07131d, 0.88).setStrokeStyle(2, color, 0.72).setDepth(90);
    this.scene.add
      .text(x, y, label, {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(91);
  }

  drawRouteArrow(origin: StarSystem, destination: StarSystem, color: number) {
    const originX = mapX(origin.x);
    const destinationX = mapX(destination.x);
    const originY = mapY(origin.y);
    const destinationY = mapY(destination.y);
    const angle = Phaser.Math.Angle.Between(originX, originY, destinationX, destinationY);
    const arrowX = Phaser.Math.Linear(originX, destinationX, 0.62);
    const arrowY = Phaser.Math.Linear(originY, destinationY, 0.62);
    const path = this.scene.add.line(0, 0, originX, originY, destinationX, destinationY, color, 0.28);
    path.setOrigin(0, 0).setLineWidth(7).setDepth(6);
    const arrow = this.scene.add.triangle(arrowX, arrowY, 0, -7, 15, 0, 0, 7, color, 0.94);
    arrow.setRotation(angle);
    arrow.setDepth(8);
  }

  drawAttackPreview(origin: StarSystem, destination: StarSystem, chance: number) {
    const originX = mapX(origin.x);
    const originY = mapY(origin.y);
    const destinationX = mapX(destination.x);
    const destinationY = mapY(destination.y);
    const originType = this.systemType(origin);
    const destinationTraits = getSystemTypeTraits(destination);
    const particleCount = Phaser.Math.Clamp(Math.round(3 + chance * 3), 3, 5);

    this.drawAttackOriginPips(originX, originY, originType);
    this.drawAttackRouteEnergy(originX, originY, destinationX, destinationY, particleCount, originType);
    this.drawTargetDefencePips(destinationX, destinationY, destinationTraits.defenceModifier, this.systemType(destination), this.scene.time.now);
  }

  drawDebugLog(snapshot: GalaxySnapshot) {
    if (window.localStorage.getItem("odd-orbit:debug-galaxy-log") !== "true") {
      return;
    }

    snapshot.turnLog.slice(0, 5).forEach((entry, index) => {
      const palette = ownerPalette[entry.faction];
      this.scene.add.circle(18, 612 + index * 16, 3, palette.fill, 0.92).setDepth(90);
      this.scene.add
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

  drawGameOver(snapshot: GalaxySnapshot) {
    const won = snapshot.gameOverStatus === "won";
    const color = won ? 0x66f2a8 : 0xff6d75;
    this.scene.add.rectangle(195, 360, 390, 720, 0x07131d, 0.82).setDepth(200);
    this.scene.add.circle(195, 304, 76, color, 0.2).setStrokeStyle(5, color, 0.8).setDepth(201);
    this.scene.add
      .text(195, 346, won ? "Galaxy Secured" : "Faction Scattered", {
        color: "#f7fbff",
        fontFamily: "Inter, sans-serif",
        fontSize: "24px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setDepth(202);
  }

  private systemCue(options: DrawSystemsOptions, system: StarSystem, selected: StarSystem | undefined): SystemCue {
    if (options.arrivalEffectPlaying || options.strategyAnimationPlaying) {
      return "none";
    }
    if (options.snapshot.turnPhase === "deploy" && system.owner === "player" && options.snapshot.deploymentUnitsRemaining > 0) {
      return "deploy";
    }
    if (options.snapshot.turnPhase === "command") {
      if (!selected && system.owner === "player" && system.fleetUnits > 1) {
        return "attack-origin";
      }
      if (selected && selected.neighbours.includes(system.id) && system.owner !== "player") {
        return "attack-target";
      }
    }
    if (options.snapshot.turnPhase === "fortify") {
      if (selected && options.destinationSystemId) {
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

  private drawRouteMotion(origin: StarSystem, destination: StarSystem, color: number, count: number) {
    const timeOffset = (this.scene.time.now * 0.0012) % 1;
    for (let index = 0; index < count; index += 1) {
      const t = (timeOffset + index / count) % 1;
      const x = Phaser.Math.Linear(mapX(origin.x), mapX(destination.x), t);
      const y = Phaser.Math.Linear(mapY(origin.y), mapY(destination.y), t);
      this.scene.add.circle(x, y, 2.7, color, 0.9).setDepth(5);
    }
  }

  private drawCueHalo(system: StarSystem, radius: number, cue: SystemCue, time: number) {
    if (cue === "none") {
      return;
    }

    const pulse = 0.5 + Math.sin(time * 0.006 + system.x * 0.03) * 0.5;
    const color = cue === "deploy" ? 0x66f2a8 : cue === "attack-origin" ? 0xffe66f : cue === "attack-target" ? 0x66f2a8 : 0x7ee4ff;
    const alpha = Phaser.Math.Linear(0.16, 0.42, pulse);
    const scale = Phaser.Math.Linear(1, 1.18, pulse);
    this.scene.add.circle(mapX(system.x), mapY(system.y), (radius + 10) * scale, color, alpha * 0.5).setStrokeStyle(2.2, color, alpha).setDepth(2);
  }

  private drawSystemTypeVisual(system: StarSystem, radius: number, time: number, intensity: number) {
    const type = this.systemType(system);
    const x = mapX(system.x);
    const y = mapY(system.y);
    const palette = ownerPalette[system.owner];

    switch (type) {
      case "mining":
        this.drawMiningVisual(x, y, radius, time, intensity);
        break;
      case "fortress":
        this.drawFortressVisual(x, y, radius, palette.stroke, time, intensity);
        break;
      case "core":
        this.drawCoreVisual(x, y, radius, palette.stroke, time, intensity);
        break;
      case "rift":
        this.drawRiftVisual(x, y, radius, time, intensity);
        break;
      case "frontier":
      default:
        this.drawFrontierVisual(x, y, radius, time, intensity);
        break;
    }
  }

  private drawFrontierVisual(x: number, y: number, radius: number, time: number, intensity: number) {
    const breathe = 0.5 + Math.sin(time * 0.0018 + x * 0.02) * 0.5;
    const alpha = Phaser.Math.Linear(0.12, 0.28, breathe) * intensity;
    const scale = Phaser.Math.Linear(1, 1.08, breathe);
    this.scene.add.circle(x, y, (radius + 7) * scale, 0xd9edf5, 0).setStrokeStyle(1.2, 0xd9edf5, alpha).setDepth(3.4);
    const moteAngle = time * 0.00028 + x * 0.015;
    this.scene.add.circle(x + Math.cos(moteAngle) * (radius + 14), y + Math.sin(moteAngle) * (radius + 11), 1.1, 0xd9f7ff, alpha * 0.78).setDepth(5.7);
  }

  private drawMiningVisual(x: number, y: number, radius: number, time: number, intensity: number) {
    const orbit = radius + 14;
    this.scene.add.circle(x, y, radius + 9, 0xffd45f, 0.045 * intensity).setStrokeStyle(1.8, 0xffd45f, 0.36 * intensity).setDepth(3.6);
    for (let index = 0; index < 3; index += 1) {
      const angle = time * 0.00065 + index * ((Math.PI * 2) / 3);
      const ghostAngle = angle - 0.26;
      this.scene.add.circle(x + Math.cos(ghostAngle) * orbit, y + Math.sin(ghostAngle) * orbit * 0.82, 3.7, 0xffd45f, 0.2 * intensity).setDepth(6.05);
      const pip = this.scene.add.circle(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.82, 4.4, 0xffd45f, 0.94 * intensity);
      pip.setStrokeStyle(1.5, 0xfff6b0, 0.9).setDepth(6.3);
    }
    const sparkle = Math.max(0, Math.sin(time * 0.0022 + x * 0.03));
    for (let index = 0; index < 3; index += 1) {
      const angle = Math.PI / 7 + index * 2.1;
      const fragment = this.scene.add.rectangle(x + Math.cos(angle) * (radius + 18), y + Math.sin(angle) * (radius + 14), 3.8, 2.3, 0xfff6b0, (0.42 + sparkle * 0.34) * intensity);
      fragment.setRotation(angle).setDepth(6.2);
    }
  }

  private drawFortressVisual(x: number, y: number, radius: number, ownerStroke: number, time: number, intensity: number) {
    const shieldPulse = 0.5 + Math.sin(time * 0.0015 + y * 0.02) * 0.5;
    this.scene.add.circle(x, y, radius + 8, 0xd9edf5, 0.04 * intensity).setStrokeStyle(4.2, 0xd9edf5, Phaser.Math.Linear(0.35, 0.65, shieldPulse) * intensity).setDepth(3.5);
    this.scene.add.circle(x, y, radius + 14, ownerStroke, 0).setStrokeStyle(1.8, ownerStroke, 0.28 * intensity).setDepth(3.4);
    const glintIndex = Math.floor(time * 0.00035 + x * 0.01) % 4;
    for (let index = 0; index < 4; index += 1) {
      const angle = -Math.PI / 4 + index * (Math.PI / 2);
      const plate = this.scene.add.rectangle(x + Math.cos(angle) * (radius + 16), y + Math.sin(angle) * (radius + 16), 15, 6.5, 0xd9edf5, 0.94);
      plate.setStrokeStyle(1, ownerStroke, 0.72).setRotation(angle).setDepth(6.2);
      if (index === glintIndex) {
        this.scene.add.rectangle(x + Math.cos(angle) * (radius + 16), y + Math.sin(angle) * (radius + 16), 8, 1.2, 0xffffff, 0.42 * intensity).setRotation(angle).setDepth(6.35);
      }
    }
  }

  private drawCoreVisual(x: number, y: number, radius: number, ownerStroke: number, time: number, intensity: number) {
    const innerSpin = time * 0.00045;
    const outerSpin = -time * 0.00032;
    const heartbeat = 0.5 + Math.sin(time * 0.0021 + x * 0.01) * 0.5;
    this.scene.add.circle(x, y, radius + 20, 0x9ee7ff, 0.03 * intensity).setDepth(3.2);
    this.drawArcSegment(x, y, radius + 9, innerSpin, innerSpin + 1.65, 0x9ee7ff, 0.78 * intensity, 2.3, 3.6);
    this.drawArcSegment(x, y, radius + 9, innerSpin + Math.PI, innerSpin + Math.PI + 1.35, 0xffffff, 0.52 * intensity, 1.8, 3.6);
    this.drawArcSegment(x, y, radius + 15, outerSpin, outerSpin + 1.18, 0xffffff, 0.52 * intensity, 1.8, 3.5);
    this.drawArcSegment(x, y, radius + 15, outerSpin + Math.PI, outerSpin + Math.PI + 1.5, ownerStroke, 0.5 * intensity, 1.8, 3.5);
    for (let index = 0; index < 4; index += 1) {
      const angle = outerSpin + index * (Math.PI / 2);
      this.scene.add.rectangle(x + Math.cos(angle) * (radius + 17), y + Math.sin(angle) * (radius + 17), 5, 1.8, 0x9ee7ff, (0.42 + heartbeat * 0.34) * intensity).setRotation(angle).setDepth(6.1);
    }
    this.scene.add.star(x, y - radius * 0.08, 5, 3, 6.4, 0xf7fbff, Phaser.Math.Linear(0.55, 0.9, heartbeat) * intensity).setDepth(6.3);
    this.scene.add.star(x, y - radius * 0.08, 5, 5.4, 8.8, 0x9ee7ff, Phaser.Math.Linear(0.16, 0.32, heartbeat) * intensity).setDepth(6.2);
  }

  private drawRiftVisual(x: number, y: number, radius: number, time: number, intensity: number) {
    const cyanSpin = time * 0.0012;
    const purpleSpin = -time * 0.00085;
    const flicker = 0.45 + Math.sin(time * 0.006 + x) * 0.35 + Math.sin(time * 0.013 + y) * 0.2;
    this.scene.add.circle(x, y, radius + 6, 0x9b6dff, 0.045 * intensity).setStrokeStyle(1.4, 0x66f2ff, 0.34 * intensity).setDepth(3.4);
    this.drawArcSegment(x, y, radius + 13, cyanSpin - 0.3, cyanSpin + 1.15, 0x66f2ff, 0.76 * intensity, 3.2, 6.1);
    this.drawArcSegment(x, y, radius + 13, purpleSpin + Math.PI + 0.15, purpleSpin + Math.PI + 1.32, 0x9b6dff, 0.72 * intensity, 3.2, 6.1);
    this.drawArcSegment(x, y, radius + 19, cyanSpin + 1.72, cyanSpin + 2.15, 0xd9f7ff, 0.42 * intensity, 2.2, 6);
    this.scene.add.triangle(x - radius - 11 + Math.sin(time * 0.002) * 1.5, y + 1, 0, -5, 10, 0, 0, 5, 0x9b6dff, Phaser.Math.Clamp(flicker, 0.25, 0.92) * intensity).setRotation(cyanSpin + 0.55).setDepth(6.2);
    this.scene.add.circle(x + radius + 11, y - 2 + Math.cos(time * 0.0024) * 1.2, 3.1, 0x66f2ff, Phaser.Math.Clamp(flicker + 0.1, 0.32, 0.95) * intensity).setStrokeStyle(1, 0xd9f7ff, 0.62).setDepth(6.2);
    const vortexX = x + Math.cos(cyanSpin + 0.9) * (radius + 8);
    const vortexY = y + Math.sin(cyanSpin + 0.9) * (radius + 6) * 0.78;
    this.scene.add
      .circle(vortexX, vortexY, 2.4, 0x07131d, 0.42)
      .setStrokeStyle(1.2, 0x66f2ff, (0.34 + flicker * 0.18) * intensity)
      .setDepth(6.1);
  }

  private drawArcSegment(x: number, y: number, radius: number, start: number, end: number, color: number, alpha: number, width: number, depth: number) {
    const arc = this.scene.add.graphics();
    arc.lineStyle(width, color, alpha);
    arc.beginPath();
    arc.arc(x, y, radius, start, end, false);
    arc.strokePath();
    arc.setDepth(depth);
  }

  private productionSourcePoint(system: StarSystem, type: SystemType, time: number) {
    const x = mapX(system.x);
    const y = mapY(system.y);
    if (type !== "mining") {
      return new Phaser.Math.Vector2(x, y);
    }

    const radius = system.systemType === "core" ? 19 : system.systemType === "fortress" ? 18 : 16;
    const orbit = radius + 14;
    const cycle = Math.floor(time / 1500) % 3;
    const angle = time * 0.00065 + cycle * ((Math.PI * 2) / 3);
    return new Phaser.Math.Vector2(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.82);
  }

  private drawProductionPulse(source: Phaser.Math.Vector2, target: Phaser.Math.Vector2, color: number, delaySeconds: number, time: number) {
    const cycleMs = 1500;
    const t = ((time + delaySeconds * 1000) % cycleMs) / cycleMs;
    const eased = Phaser.Math.Easing.Sine.InOut(t);
    const x = Phaser.Math.Linear(source.x, target.x, eased);
    const y = Phaser.Math.Linear(source.y, target.y, eased);
    const alpha = Phaser.Math.Clamp(1 - t, 0.15, 0.9);
    this.scene.add.line(0, 0, source.x, source.y, target.x, target.y, color, 0.08 + alpha * 0.08).setOrigin(0, 0).setLineWidth(2.2).setDepth(61);
    this.scene.add.circle(x, y, 4.4 - t * 1.8, color, alpha).setStrokeStyle(1.4, 0xffffff, 0.55 * alpha).setDepth(62);
  }

  private drawConstellationBonusPulse(x: number, y: number, width: number, height: number, color: number) {
    const cycle = (this.scene.time.now % 1900) / 1900;
    const alpha = 0.22 * (1 - cycle);
    this.scene.add.ellipse(x, y, (width + 12) * (1 + cycle * 0.06), (height + 10) * (1 + cycle * 0.06), color, 0.025).setStrokeStyle(1.7, color, alpha).setDepth(0.7);
    const particleX = Phaser.Math.Linear(x, 39, Phaser.Math.Easing.Sine.InOut(cycle));
    const particleY = Phaser.Math.Linear(y, 118, Phaser.Math.Easing.Sine.InOut(cycle));
    this.scene.add.circle(particleX, particleY, 3.6 - cycle * 1.5, color, 0.72 * (1 - cycle)).setDepth(62);
  }

  private drawAttackOriginPips(x: number, y: number, originType: SystemType) {
    const color = originType === "rift" ? 0x9b6dff : originType === "core" ? 0x9ee7ff : 0x66f2a8;
    const count = originType === "rift" || originType === "core" ? 4 : 3;
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI / 2 + index * ((Math.PI * 2) / count);
      this.scene.add.circle(x + Math.cos(angle) * 33, y + Math.sin(angle) * 28, 3, color, 0.95).setStrokeStyle(1, 0xffffff, 0.45).setDepth(8.2);
    }
    if (originType === "rift") {
      this.drawArcSegment(x, y, 38, -0.45, 0.86, 0x66f2ff, 0.92, 3.2, 8.1);
      this.drawArcSegment(x, y, 43, 2.4, 3.35, 0x9b6dff, 0.86, 2.6, 8.1);
    }
    if (originType === "core") {
      this.scene.add.circle(x, y, 34, 0xffffff, 0.03).setStrokeStyle(2.2, 0x9ee7ff, 0.84).setDepth(8.1);
    }
  }

  private drawAttackRouteEnergy(originX: number, originY: number, destinationX: number, destinationY: number, count: number, originType: SystemType) {
    const color = originType === "rift" ? 0x9b6dff : originType === "core" ? 0x9ee7ff : 0x66f2a8;
    for (let index = 0; index < count; index += 1) {
      const t = 0.2 + (index / Math.max(1, count - 1)) * 0.58;
      const x = Phaser.Math.Linear(originX, destinationX, t);
      const y = Phaser.Math.Linear(originY, destinationY, t);
      this.scene.add.circle(x, y, originType === "rift" ? 3 : 2.6, color, 0.82).setDepth(8.4);
    }
    if (originType === "rift" || originType === "core") {
      this.scene.add.line(0, 0, originX, originY, destinationX, destinationY, color, originType === "rift" ? 0.26 : 0.18).setOrigin(0, 0).setLineWidth(originType === "rift" ? 4 : 3).setDepth(7.5);
    }
  }

  private drawTargetDefencePips(x: number, y: number, defenceModifier: number, targetType: SystemType, time: number) {
    const count = Phaser.Math.Clamp(Math.round(defenceModifier * 3), 2, 4);
    const color = targetType === "fortress" ? 0xd9edf5 : targetType === "core" ? 0x9ee7ff : 0x8da2b5;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI / 4 + index * ((Math.PI * 2) / count);
      this.scene.add.rectangle(x + Math.cos(angle) * 34, y + Math.sin(angle) * 30, targetType === "fortress" ? 10 : 7, targetType === "fortress" ? 4.8 : 3.4, color, 0.88).setRotation(angle).setDepth(8.3);
    }
    if (targetType === "fortress" || targetType === "core") {
      const pulse = 0.5 + Math.sin(time * 0.0032 + x * 0.01) * 0.5;
      const radius = (targetType === "fortress" ? 37 : 34) * Phaser.Math.Linear(1, 1.16, pulse);
      this.scene.add.circle(x, y, radius, color, 0.04).setStrokeStyle(targetType === "fortress" ? 4 : 2.6, color, Phaser.Math.Linear(0.48, 0.86, pulse)).setDepth(8.1);
    }
  }

  private systemType(system: StarSystem): SystemType {
    return system.systemType ?? "frontier";
  }

  private isSelectedRoute(firstId: string, secondId: string, selectedSystemId: string | undefined, destinationSystemId: string | undefined) {
    return Boolean(
      selectedSystemId &&
        destinationSystemId &&
        ((selectedSystemId === firstId && destinationSystemId === secondId) || (selectedSystemId === secondId && destinationSystemId === firstId))
    );
  }

  private isActionLane(firstId: string, secondId: string, activeAction: GalaxyAction | undefined) {
    const origin = activeAction?.originSystemId;
    const destination = activeAction?.destinationSystemId;
    return Boolean(origin && destination && ((origin === firstId && destination === secondId) || (origin === secondId && destination === firstId)));
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
