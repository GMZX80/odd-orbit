import { createRng } from "./rng";
import type { CollisionReward, GateEffect, RunResult, RunStateSnapshot, SpawnSpec } from "./runTypes";

const artefactNames = [
  "Self-Aware Spoon",
  "Diplomatic Sock",
  "Tiny Moon Coupon",
  "Forbidden Sandwich Map"
];

const npcMessages = [
  "A space intern waved aggressively.",
  "Captain Blorb demanded exact change.",
  "A suspicious shuttle tried small talk.",
  "The Space DMV appeared, briefly."
];

const gateLabels: GateEffect[] = ["+1", "x2", "-1", "curse"];

interface RunSimulatorOptions {
  destination: string;
  seed: number;
}

export class RunSimulator {
  readonly laneCount = 5;
  readonly distanceGoal = 1200;
  private readonly rng;
  private readonly destination;
  private spawnTimer = 0;
  private nextId = 0;
  private distance = 0;
  private coins = 0;
  private fuel = 100;
  private hull = 3;
  private cursed = false;
  private finished = false;
  private artefacts = new Set<string>();

  constructor(options: RunSimulatorOptions) {
    this.destination = options.destination;
    this.rng = createRng(options.seed);
  }

  update(deltaSeconds: number): SpawnSpec[] {
    if (this.finished) {
      return [];
    }

    this.distance += 58 * deltaSeconds;
    this.fuel = Math.max(0, this.fuel - 3.7 * deltaSeconds);
    this.spawnTimer -= deltaSeconds;

    const spawns: SpawnSpec[] = [];
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.rng.next() < 0.26 ? 0.34 : this.rng.int(52, 84) / 100;
      spawns.push(...this.createSpawnWave());
    }

    if (this.fuel <= 0 || this.hull <= 0 || this.distance >= this.distanceGoal) {
      this.finished = true;
    }

    return spawns;
  }

  collect(kind: SpawnSpec["kind"], gateEffect?: GateEffect): CollisionReward {
    if (this.finished) {
      return { remove: true };
    }

    if (kind === "coin") {
      this.coins += this.cursed ? 1 : 2;
      return { remove: true, message: this.cursed ? "Cursed coin. Still legal." : "Coin scoop!" };
    }

    if (kind === "fuel") {
      this.fuel = Math.min(100, this.fuel + 18);
      return { remove: true, message: "Fuel can: probably fuel." };
    }

    if (kind === "artefact") {
      const artefact = this.rng.pick(artefactNames);
      this.artefacts.add(artefact);
      return { remove: true, message: `Collected ${artefact}.` };
    }

    if (kind === "hazard") {
      this.hull -= 1;
      this.coins = Math.max(0, this.coins - 2);
      return { remove: true, message: "Hull dented by premium space junk." };
    }

    if (kind === "npc") {
      this.hull -= this.cursed ? 1 : 0;
      return { remove: true, message: this.rng.pick(npcMessages) };
    }

    if (kind === "gate" && gateEffect) {
      return this.applyGate(gateEffect);
    }

    return { remove: true };
  }

  snapshot(): RunStateSnapshot {
    return {
      destination: this.destination,
      coins: this.coins,
      fuel: Math.ceil(this.fuel),
      hull: this.hull,
      distance: Math.min(this.distance, this.distanceGoal),
      distanceGoal: this.distanceGoal,
      artefacts: [...this.artefacts],
      cursed: this.cursed
    };
  }

  isFinished() {
    return this.finished;
  }

  result(): RunResult {
    const arrived = this.distance >= this.distanceGoal && this.hull > 0 && this.fuel > 0;
    const coins = arrived ? this.coins + 8 : Math.max(3, Math.floor(this.coins * 0.45));
    return {
      status: arrived ? "arrived" : "limped-home",
      destination: this.destination,
      coins,
      artefacts: [...this.artefacts],
      distance: Math.floor(Math.min(this.distance, this.distanceGoal)),
      hull: Math.max(0, this.hull),
      fuel: Math.max(0, Math.ceil(this.fuel)),
      consolation: !arrived,
      message: arrived
        ? "You reached Cheese Minor and were applauded by three confused satellites."
        : "The ship limped home smelling like hot wires, but the receipt says adventure.",
      completedAt: new Date().toISOString()
    };
  }

  private createSpawnWave(): SpawnSpec[] {
    const lane = this.rng.int(0, this.laneCount - 1);
    const roll = this.rng.next();

    if (roll < 0.32) {
      return [this.spawn("coin", lane, "coin")];
    }

    if (roll < 0.44) {
      return [this.spawn("fuel", lane, "fuel")];
    }

    if (roll < 0.62) {
      const lanes = new Set([lane, this.rng.int(0, this.laneCount - 1), this.rng.int(0, this.laneCount - 1)]);
      return [...lanes].map((hazardLane, index) => {
        const hazard = this.spawn("hazard", hazardLane, "JUNK");
        hazard.y -= index * 38;
        return hazard;
      });
    }

    if (roll < 0.76) {
      return [this.spawn("npc", lane, "NPC")];
    }

    if (roll < 0.88) {
      return [this.spawn("artefact", lane, "?")];
    }

    const first = this.spawn("gate", Math.max(0, lane - 1), this.rng.pick(gateLabels));
    const second = this.spawn("gate", Math.min(this.laneCount - 1, lane + 1), this.rng.pick(gateLabels));
    return [first, second];
  }

  private spawn(kind: SpawnSpec["kind"], lane: number, label: string): SpawnSpec {
    const gateEffect = kind === "gate" ? (label as GateEffect) : undefined;
    return {
      id: `${kind}-${this.nextId++}`,
      kind,
      lane,
      y: 92,
      speed: this.cursed ? 230 : 196,
      label,
      gateEffect
    };
  }

  private applyGate(effect: GateEffect): CollisionReward {
    if (effect === "+1") {
      this.coins += 1;
      this.hull = Math.min(4, this.hull + 1);
      return { remove: true, message: "+1 hull, signed by a qualified alien." };
    }

    if (effect === "x2") {
      this.coins *= 2;
      return { remove: true, message: "Coins doubled. Accounting panics." };
    }

    if (effect === "-1") {
      this.hull -= 1;
      return { remove: true, message: "-1 hull. The gate was honest, at least." };
    }

    this.cursed = !this.cursed;
    return {
      remove: true,
      message: this.cursed ? "Cursed mode: everything is faster and legally weird." : "Curse lifted. Mostly."
    };
  }
}
