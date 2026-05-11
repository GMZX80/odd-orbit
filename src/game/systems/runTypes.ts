export type EntityKind = "coin" | "fuel" | "hazard" | "npc" | "artefact" | "gate";

export type GateEffect = "+1" | "x2" | "-1" | "curse";

export interface SpawnSpec {
  id: string;
  kind: EntityKind;
  lane: number;
  y: number;
  speed: number;
  label?: string;
  gateEffect?: GateEffect;
}

export interface RunStateSnapshot {
  destination: string;
  coins: number;
  fuel: number;
  hull: number;
  distance: number;
  distanceGoal: number;
  artefacts: string[];
  cursed: boolean;
}

export interface RunResult {
  status: "arrived" | "limped-home";
  destination: string;
  coins: number;
  artefacts: string[];
  distance: number;
  hull: number;
  fuel: number;
  consolation: boolean;
  message: string;
  completedAt: string;
}

export interface CollisionReward {
  remove: boolean;
  message?: string;
  finished?: boolean;
}
