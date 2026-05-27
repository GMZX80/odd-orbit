export const TRAVEL_LANES = {
  left: 0,
  center: 1,
  card: 2,
  count: 3
} as const;

export const TRAVEL_LIMITS = {
  maxVisibleEnemies: 120,
  maxActiveSidewinders: 2,
  maxActiveBroodCores: 1,
  maxEnemiesAfterBroodRupture: 220
} as const;

export const TRAVEL_COMBAT = {
  sidewinderDamageToBroodCore: 5,
  bulletAimSpreadX: 30,
  wormholeAimSpreadX: 11
} as const;

export const TRAVEL_RUN = {
  distanceGoal: 1500,
  timeLimitMs: 38000
} as const;

export const TRAVEL_ROAD = {
  horizonY: 82,
  bottomY: 720,
  topWidth: 118,
  bottomWidth: 488,
  centerX: 195,
  playerY: 628
} as const;
