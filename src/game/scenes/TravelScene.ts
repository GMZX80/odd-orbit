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

const laneX = [51, 123, 195, 267, 339];
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
  private selectedLane = 2;
  private roadOffset = 0;
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
    this.selectedLane = 2;
    this.simulator = new RunSimulator({
      destination: data.destination,
      seed: data.seed
    });

    this.createStarfield();
    this.createLaneMarkers();
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
    this.roadOffset = (this.roadOffset + delta * 0.08) % 54;
    this.children.getByName("lane-lines")?.setData("offset", this.roadOffset);

    if (!this.player || !this.simulator || this.idle || this.ending) {
      this.animatePlayer(delta);
      return;
    }

    const deltaSeconds = delta / 1000;
    const spawns = this.simulator.update(deltaSeconds);
    spawns.forEach((spawn) => this.addEntity(spawn));

    this.animatePlayer(delta);
    this.moveEntities(deltaSeconds);
    this.checkCollisions();
    gameEvents.emit("run:update", this.simulator.snapshot());

    if (this.simulator.isFinished()) {
      this.finishRun(this.simulator.result());
    }

    this.distanceText?.setText(`${Math.floor((this.simulator.snapshot().distance / this.simulator.distanceGoal) * 100)}% to Cheese Minor`);
  }

  private createStarfield() {
    this.add.rectangle(195, 360, 390, 720, 0x07131d);
    for (let index = 0; index < 90; index += 1) {
      const x = Phaser.Math.Between(6, 384);
      const y = Phaser.Math.Between(0, 720);
      const radius = Phaser.Math.FloatBetween(0.8, 2.2);
      const alpha = Phaser.Math.FloatBetween(0.22, 0.9);
      const star = this.add.circle(x, y, radius, 0xffffff, alpha);
      this.tweens.add({
        targets: star,
        y: y + Phaser.Math.Between(18, 44),
        duration: Phaser.Math.Between(1100, 2300),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }
    this.add.circle(66, 132, 34, 0x243b5a, 0.8);
    this.add.circle(326, 214, 22, 0x6a3f7d, 0.7);
  }

  private createLaneMarkers() {
    const graphics = this.add.graphics();
    graphics.setName("lane-lines");
    graphics.setDepth(0);
    const draw = () => {
      const offset = graphics.getData("offset") ?? 0;
      graphics.clear();
      graphics.lineStyle(2, 0x2c5a73, 0.42);
      for (const x of [87, 159, 231, 303]) {
        for (let y = -54 + offset; y < 750; y += 54) {
          graphics.strokeLineShape(new Phaser.Geom.Line(x, y, x, y + 24));
        }
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, draw);
  }

  private createPlayer() {
    const ship = this.add.container(laneX[this.selectedLane], 606);
    const flame = this.add.triangle(0, 24, -9, 0, 9, 0, 0, 22, 0xff8a65, 0.9);
    const hull = this.add.triangle(0, -12, -24, 24, 24, 24, 0, -30, 0xe7fbff);
    const window = this.add.circle(0, 0, 8, 0x43c7ff);
    const wobble = this.add.text(0, 24, "S.S. ?", {
      color: "#07131d",
      fontFamily: "Inter, sans-serif",
      fontSize: "9px",
      fontStyle: "900"
    }).setOrigin(0.5);
    ship.add([flame, hull, window, wobble]);
    ship.setDepth(4);
    this.player = ship;
  }

  private createInput() {
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.idle) {
        return;
      }
      this.selectedLane = Phaser.Math.Clamp(Math.floor(pointer.x / 78), 0, 4);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.idle) {
        this.selectedLane = Phaser.Math.Clamp(Math.floor(pointer.x / 78), 0, 4);
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
    const targetX = laneX[this.selectedLane];
    this.player.x = Phaser.Math.Linear(this.player.x, targetX, Math.min(1, delta / 80));
    this.player.y = 606 + Math.sin(this.time.now / 130) * 4;
    this.player.rotation = Phaser.Math.Clamp((targetX - this.player.x) / 120, -0.28, 0.28);
  }

  private addEntity(spec: SpawnSpec) {
    const body = this.add.container(laneX[spec.lane], spec.y);
    body.setDepth(3);

    if (spec.kind === "gate") {
      const isGood = spec.gateEffect === "+1" || spec.gateEffect === "x2";
      body.add(this.add.rectangle(0, 0, 56, 58, isGood ? colors.gateGood : colors.gateBad, 0.8));
      body.add(this.add.rectangle(0, 0, 48, 50, 0x07131d, 0.52));
    } else if (spec.kind === "hazard") {
      body.add(this.add.star(0, 0, 8, 13, 26, colors.hazard));
    } else if (spec.kind === "npc") {
      body.add(this.add.ellipse(0, 0, 48, 28, colors.npc));
      body.add(this.add.circle(10, -2, 6, 0x07131d));
    } else if (spec.kind === "coin") {
      body.add(this.add.circle(0, 0, 17, colors.coin));
    } else if (spec.kind === "fuel") {
      body.add(this.add.rectangle(0, 0, 28, 36, colors.fuel));
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

    this.activeEntities.push({ spec, body });
  }

  private moveEntities(deltaSeconds: number) {
    for (const entity of this.activeEntities) {
      entity.body.y += entity.spec.speed * deltaSeconds;
      entity.body.rotation += entity.spec.kind === "hazard" ? deltaSeconds * 2.4 : 0;
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

  private checkCollisions() {
    if (!this.player || !this.simulator) {
      return;
    }

    for (const entity of this.activeEntities) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entity.body.x, entity.body.y);
      if (distance > 42) {
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

  private finishRun(result: RunResult) {
    this.ending = true;
    this.cameras.main.fadeOut(360, 7, 19, 29);
    this.time.delayedCall(380, () => {
      gameEvents.emit("run:end", result);
      this.scene.pause();
    });
  }
}
