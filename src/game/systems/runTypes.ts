import type { WormholeRunInput, WormholeRunResult } from "./galaxyTypes";

export interface RunStateSnapshot {
  units: number;
  distance: number;
  distanceGoal: number;
}

export interface RunResult extends WormholeRunResult {
  status: "complete" | "game-over";
  distance: number;
  units: number;
  message: string;
  completedAt: string;
  runInput?: WormholeRunInput;
}
