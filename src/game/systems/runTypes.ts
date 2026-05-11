export interface RunStateSnapshot {
  units: number;
  distance: number;
  distanceGoal: number;
}

export interface RunResult {
  status: "complete" | "game-over";
  distance: number;
  units: number;
  message: string;
  completedAt: string;
}
