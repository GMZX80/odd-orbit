export type FactionId = "player" | "crimson" | "amber" | "violet" | "neutral";

export type TurnPhase = "deploy" | "command" | "fortify" | "npcTurn" | "gameOver";

export type RouteDifficulty = "easy" | "normal" | "hard";

export type StrategicResolutionMode = "play" | "auto";

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  owner: FactionId;
  fleetUnits: number;
  resourceValue: number;
  constellationId: string;
  neighbours: string[];
  systemType?: "core" | "mining" | "rift" | "fortress" | "frontier";
}

export interface Constellation {
  id: string;
  name: string;
  bonusUnits: number;
  tint: number;
}

export interface MoveOrder {
  originSystemId: string;
  destinationSystemId: string;
  unitsCommitted: number;
}

export interface WormholeRunInput {
  originSystemId: string;
  destinationSystemId: string;
  startingUnits: number;
  routeDifficulty: RouteDifficulty;
  destinationFactionId: FactionId;
  destinationFactionColor: number;
}

export interface WormholeRunResult {
  escaped: boolean;
  startingUnits: number;
  finalUnits: number;
  distanceTravelled: number;
  failureReason?: string;
}

export interface GalaxyResolution {
  title: string;
  detail: string;
}

export interface TurnLogEntry {
  id: number;
  message: string;
  faction: FactionId;
}

export interface GalaxyAction {
  title: string;
  detail: string;
  faction: FactionId;
  originSystemId?: string;
  destinationSystemId?: string;
}

export type StrategicArrivalOutcome = "neutralCaptured" | "enemyCaptured" | "repelled" | "failed";

export interface StrategicArrivalEffect {
  originSystemId: string;
  destinationSystemId: string;
  resolutionMode: StrategicResolutionMode;
  summaryLabel: string;
  originUnitsBefore: number;
  originUnitsAfter: number;
  attackingUnitsCommitted: number;
  attackingUnitsSurvived: number;
  rawRunnerSpheres?: number;
  convertedStrategicUnits: number;
  autoSuccessChance?: number;
  defenderUnitsBefore: number;
  defenderUnitsAfter: number;
  destinationUnitsAfter: number;
  destinationOwnerBefore: FactionId;
  destinationOwnerAfter: FactionId;
  outcome: StrategicArrivalOutcome;
}
