import Phaser from "phaser";
import { gameEvents } from "../events";
import { RunSimulator } from "../systems/RunSimulator";
import type { RunResult, SpawnSpec } from "../systems/runTypes";

interface TravelSceneData {
  destination: string;
  seed: number;
  idle?: boolean;
}

interface ActiveEntity {
  spec: SpawnSpec;
  body: Phaser.GameObjects.Container;
}

interface ActiveBolt {
  body: Phaser.GameObjects.Container;
  lane: number;
  y: number;
}

const road = {
  horizonY: 82,
  bottomY: 720,
  topWidth: 118,
  bottomWidth: 488,
  centerX: 195,
  playerY: 628
};

const colors = {
  coin: 0xffdf62,
  fuel: 0x66f2a8,
  hazard: 0xff5f7a,
  npc: 0x7ee4ff,
  artefact: 0xd79cff,
  gateGood: 0x66f2a8,
  gateBad: 0xff8a65
};

export class TravelScene extends Phaser.Scene {
  private simulator?: RunSimulator;
  private player?: Phaser.GameObjects.Container;
  private activeEntities: ActiveEntity[] = [];
  private activeBolts: ActiveBolt[] = [];
  private selectedLane = 2;
  private roadOffset = 0;
  private fireTimer = 0;
  private idle = true;
  private ending = false;
  private distanceText?: Phaser.GameObjects.Text;

  constructor() {
    super("TravelScene");
  }

  create(data: TravelSceneData) {
    this.idle = Boolean(data.idle);
    this.ending = false;
    this.activeEntities.forEach((entity) => entity.body.destroy());
    this.activeEntities = [];
    this.activeBolts.forEach((bolt) => bolt.body.destroy());
    this.activeBolts = [];
    this.selectedLane = 2;
    this.fireTimer = 0;
    this.simulator = new RunSimulator({
      destination: data.destination,
      seed: data.seed
    });

    this.createRunnerBackdrop();
    this.createRoad();
    this.createPlayer();
    this.createInput();

    this.distanceText = this.add
      .text(195, 675, "Swipe or drag to steer", {
        color: "#9dbccc",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    if (this.idle) {
      this.player?.setAlpha(0.72);
      this.distanceText.setText("Ready for launch");
    }
  }

  update(_time: number, delta: number) {
    this.roadOffset = (this.roadOffset + delta * 0.11) % 64;
    this.children.getByName("lane-lines")?.setData("offset", this.roadOffset);

    if (!this.player || !this.simulator || this.idle || this.ending) {
      this.animatePlayer(delta);
      return;
    }

    const deltaSeconds = delta / 1000;
    const spawns = this.simulator.update(deltaSeconds);
    spawns.forEach((spawn) => this.addEntity(spawn));

    this.fireTimer -= deltaSeconds;
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.16;
      this.fireBolt();
    }

    this.animatePlayer(delta);
    this.moveEntities(deltaSeconds);
    this.moveBolts(deltaSeconds);
    this.checkBoltHits();
    this.checkCollisions();
    gameEvents.emit("run:update", this.simulator.snapshot());

    if (this.simulator.isFinished()) {
      this.finishRun(this.simulator.result());
    }

    this.distanceText?.setText(`${Math.floor((this.simulator.snapshot().distance / this.simulator.distanceGoal) * 100)}% to Cheese Minor`);
  }

  private createRunnerBackdrop() {
    this.add.rectangle(195, 360, 390, 720, 0x20324f);
    this.add.rectangle(195, 420, 390, 600, 0x263a5d, 0.78);
    for (let index = 0; index < 64; index += 1) {
      const x = Phaser.Math.Between(6, 384);
      const y = Phaser.Math.Between(0, 720);
      const radius = Phaser.Math.FloatBetween(0.8, 2.2);
      const alpha = Phaser.Math.FloatBetween(0.16, 0.62);
      const star = this.add.circle(x, y, radius, 0xffffff, alpha);
      this.tweens.add({
        targets: star,
        y: y + Phaser.Math.Between(10, 26),
        duration: Phaser.Math.Between(1100, 2300),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }
    this.add.circle(52, 150, 36, 0x304a77, 0.76);
    this.add.circle(337, 226, 22, 0x6a3f7d, 0.7);
  }

  private createRoad() {
    const roadGraphics = this.add.graphics();
    roadGraphics.fillStyle(0x9ba0b6, 1);
    roadGraphics.fillPoints(
      [
        new Phaser.Geom.Point(road.centerX - road.topWidth / 2, road.horizonY),
        new Phaser.Geom.Point(road.centerX + road.topWidth / 2, road.horizonY),
        new Phaser.Geom.Point(road.centerX + road.bottomWidth / 2, road.bottomY),
        new Phaser.Geom.Point(road.centerX - road.bottomWidth / 2, road.bottomY)
      ],
      true
    );
    roadGraphics.lineStyle(8, 0x6f748b, 1);
    roadGraphics.strokePoints(
      [
        new Phaser.Geom.Point(road.centerX - road.topWidth / 2, road.horizonY),
        new Phaser.Geom.Point(road.centerX - road.bottomWidth / 2, road.bottomY)
      ],
      false
    );
    roadGraphics.strokePoints(
      [
        new Phaser.Geom.Point(road.centerX + road.topWidth / 2, road.horizonY),
        new Phaser.Geom.Point(road.centerX + road.bottomWidth / 2, road.bottomY)
      ],
      false
    );

    const graphics = this.add.graphics();
    graphics.setName("lane-lines");
    graphics.setDepth(1);
    const draw = () => {
      const offset = graphics.getData("offset") ?? 0;
      graphics.clear();
      graphics.lineStyle(2, 0xe5edf8, 0.34);
      for (let divider = 1; divider < 5; divider += 1) {
        for (let y = road.horizonY + offset; y < road.bottomY; y += 64) {
          const nextY = Math.min(y + 28, road.bottomY);
          const x1 = this.laneBoundaryX(divider, y);
          const x2 = this.laneBoundaryX(divider, nextY);
          graphics.strokeLineShape(new Phaser.Geom.Line(x1, y, x2, nextY));
        }
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, draw);
  }

  private createPlayer() {
    const ship = this.add.container(this.laneCenterX(this.selectedLane, road.playerY), road.playerY);
    const shadow = this.add.ellipse(0, 30, 58, 18, 0x263046, 0.36);
    const ring = this.add.ellipse(0, 26, 56, 20, 0x66f2a8, 0.88);
    ring.setStrokeStyle(4, 0xffdf62, 0.8);
    const flame = this.add.triangle(0, 30, -9, 0, 9, 0, 0, 24, 0xff8a65, 0.9);
    const hull = this.add.triangle(0, -12, -24, 24, 24, 24, 0, -30, 0xe7fbff);
    const window = this.add.circle(0, 0, 8, 0x43c7ff);
    const wobble = this.add.text(0, 24, "S.S. ?", {
      color: "#07131d",
      fontFamily: "Inter, sans-serif",
      fontSize: "9px",
      fontStyle: "900"
    }).setOrigin(0.5);
    ship.add([shadow, ring, flame, hull, window, wobble]);
    ship.setDepth(20);
    this.player = ship;
  }

  private createInput() {
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.idle) {
        return;
      }
      this.selectedLane = Phaser.Math.Clamp(this.pointerLane(pointer.x, road.playerY), 0, 4);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.idle) {
        this.selectedLane = Phaser.Math.Clamp(this.pointerLane(pointer.x, road.playerY), 0, 4);
      }
    });

    this.input.keyboard?.on("keydown-LEFT", () => {
      this.selectedLane = Phaser.Math.Clamp(this.selectedLane - 1, 0, 4);
    });
    this.input.keyboard?.on("keydown-RIGHT", () => {
      this.selectedLane = Phaser.Math.Clamp(this.selectedLane + 1, 0, 4);
    });
  }

  private animatePlayer(delta: number) {
    if (!this.player) {
      return;
    }
    const targetX = this.laneCenterX(this.selectedLane, road.playerY);
    this.player.x = Phaser.Math.Linear(this.player.x, targetX, Math.min(1, delta / 80));
    this.player.y = road.playerY + Math.sin(this.time.now / 130) * 4;
    this.player.rotation = Phaser.Math.Clamp((targetX - this.player.x) / 120, -0.28, 0.28);
  }

  private addEntity(spec: SpawnSpec) {
    const body = this.add.container(this.laneCenterX(spec.lane, spec.y), spec.y);
    body.setDepth(3);

    if (spec.kind === "gate") {
      const isGood = spec.gateEffect === "+1" || spec.gateEffect === "x2";
      body.add(this.add.rectangle(0, 0, 72, 54, isGood ? colors.gateGood : colors.gateBad, 0.92));
      body.add(this.add.rectangle(0, 0, 62, 44, isGood ? 0x2f8fb5 : 0xb83c4b, 0.82));
    } else if (spec.kind === "hazard") {
      const number = Phaser.Math.Between(6, 14).toString();
      body.add(this.add.rectangle(0, 6, 62, 36, 0x9b2437, 1));
      body.add(this.add.rectangle(0, -10, 58, 16, colors.hazard, 1));
      spec.label = number;
    } else if (spec.kind === "npc") {
      body.add(this.add.ellipse(0, 4, 66, 32, colors.npc));
      body.add(this.add.rectangle(0, -8, 38, 12, 0xffdf62));
      body.add(this.add.circle(14, 0, 6, 0x07131d));
    } else if (spec.kind === "coin") {
      body.add(this.add.circle(0, 0, 17, colors.coin));
    } else if (spec.kind === "fuel") {
      body.add(this.add.rectangle(0, 0, 36, 42, colors.fuel));
    } else {
      body.add(this.add.star(0, 0, 5, 10, 22, colors.artefact));
    }

    body.add(
      this.add
        .text(0, 0, spec.label ?? "", {
          color: spec.kind === "coin" ? "#5a3b00" : "#ffffff",
          fontFamily: "Inter, sans-serif",
          fontSize: spec.kind === "gate" ? "18px" : "11px",
          fontStyle: "900"
        })
        .setOrigin(0.5)
    );

    this.applyPerspective(body, spec.lane, spec.y);
    this.activeEntities.push({ spec, body });
  }

  private moveEntities(deltaSeconds: number) {
    for (const entity of this.activeEntities) {
      entity.spec.y += entity.spec.speed * deltaSeconds;
      entity.body.y = entity.spec.y;
      entity.body.x = this.laneCenterX(entity.spec.lane, entity.spec.y);
      this.applyPerspective(entity.body, entity.spec.lane, entity.spec.y);
      entity.body.rotation += entity.spec.kind === "artefact" ? deltaSeconds * 2.4 : 0;
    }

    const visible = this.activeEntities.filter((entity) => {
      if (entity.body.y > 770) {
        entity.body.destroy();
        return false;
      }
      return true;
    });
    this.activeEntities = visible;
  }

  private fireBolt() {
    if (!this.player) {
      return;
    }

    const bolt = this.add.container(this.player.x, road.playerY - 42);
    bolt.add(this.add.circle(0, 0, 4, 0xfff08a));
    bolt.add(this.add.rectangle(0, 14, 4, 26, 0xffd35a, 0.78));
    bolt.setDepth(18);
    this.activeBolts.push({ body: bolt, lane: this.selectedLane, y: road.playerY - 42 });
  }

  private moveBolts(deltaSeconds: number) {
    for (const bolt of this.activeBolts) {
      bolt.y -= 520 * deltaSeconds;
      bolt.body.y = bolt.y;
      bolt.body.x = this.laneCenterX(bolt.lane, bolt.y);
      bolt.body.setScale(Phaser.Math.Clamp(this.scaleAtY(bolt.y) * 0.82, 0.36, 1));
    }

    this.activeBolts = this.activeBolts.filter((bolt) => {
      if (bolt.y < road.horizonY) {
        bolt.body.destroy();
        return false;
      }
      return true;
    });
  }

  private checkBoltHits() {
    for (const bolt of this.activeBolts) {
      for (const entity of this.activeEntities) {
        if (entity.spec.lane !== bolt.lane || (entity.spec.kind !== "hazard" && entity.spec.kind !== "npc")) {
          continue;
        }
        if (Math.abs(entity.spec.y - bolt.y) > 28) {
          continue;
        }
        entity.body.destroy();
        bolt.body.destroy();
        gameEvents.emit("run:event", entity.spec.kind === "npc" ? "NPC ship politely removed." : "Obstacle cleared!");
      }
    }

    this.activeEntities = this.activeEntities.filter((entity) => entity.body.active);
    this.activeBolts = this.activeBolts.filter((bolt) => bolt.body.active);
  }

  private checkCollisions() {
    if (!this.player || !this.simulator) {
      return;
    }

    for (const entity of this.activeEntities) {
      const laneMatches = entity.spec.lane === this.selectedLane;
      const yDistance = Math.abs(entity.spec.y - road.playerY);
      if (!laneMatches || yDistance > 42) {
        continue;
      }

      const reward = this.simulator.collect(entity.spec.kind, entity.spec.gateEffect);
      if (reward.message) {
        gameEvents.emit("run:event", reward.message);
      }
      if (entity.spec.kind === "hazard" || entity.spec.kind === "npc") {
        this.cameras.main.shake(120, 0.008);
      }
      if (reward.remove) {
        entity.body.destroy();
      }
    }

    this.activeEntities = this.activeEntities.filter((entity) => entity.body.active);
  }

  private laneCenterX(lane: number, y: number) {
    const width = this.roadWidthAtY(y);
    const left = road.centerX - width / 2;
    return left + ((lane + 0.5) / 5) * width;
  }

  private laneBoundaryX(divider: number, y: number) {
    const width = this.roadWidthAtY(y);
    const left = road.centerX - width / 2;
    return left + (divider / 5) * width;
  }

  private roadWidthAtY(y: number) {
    const progress = Phaser.Math.Clamp((y - road.horizonY) / (road.bottomY - road.horizonY), 0, 1);
    return Phaser.Math.Linear(road.topWidth, road.bottomWidth, progress);
  }

  private scaleAtY(y: number) {
    const progress = Phaser.Math.Clamp((y - road.horizonY) / (road.bottomY - road.horizonY), 0, 1);
    return Phaser.Math.Linear(0.34, 1.18, progress);
  }

  private applyPerspective(body: Phaser.GameObjects.Container, lane: number, y: number) {
    body.x = this.laneCenterX(lane, y);
    body.y = y;
    body.setScale(this.scaleAtY(y));
    body.setDepth(Math.floor(y));
  }

  private pointerLane(x: number, y: number) {
    const width = this.roadWidthAtY(y);
    const left = road.centerX - width / 2;
    return Math.floor(((x - left) / width) * 5);
  }

  private finishRun(result: RunResult) {
    this.ending = true;
    this.cameras.main.fadeOut(360, 7, 19, 29);
    this.time.delayedCall(380, () => {
      gameEvents.emit("run:end", result);
      this.scene.pause();
    });
  }
}
