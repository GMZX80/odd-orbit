import { activeShooterLimit, averageFireIntervalSecondsForUnits } from "./firepower";

export type CardDifficulty = "repairable" | "tax" | "threat" | "wall";

export interface BalancedCard {
  value: number;
  difficulty: CardDifficulty | "positive";
  expectedHits: number;
  estimatedValueAtCollision: number;
}

interface EstimateHitsParams {
  playerUnits: number;
  timeToCollisionSeconds: number;
}

interface NegativeCardParams extends EstimateHitsParams {
  distanceTravelled: number;
  targetRunDistance: number;
  difficulty: CardDifficulty;
}

interface PositiveCardParams {
  playerUnits: number;
  distanceTravelled: number;
  targetRunDistance: number;
  random?: () => number;
}

interface RowParams extends PositiveCardParams {
  laneCount: number;
  timeToCollisionSeconds: number;
  random: () => number;
}

type SingleCardParams = Omit<RowParams, "laneCount">;

export function estimateExpectedHitsBeforeCollision(params: EstimateHitsParams) {
  const activeShooters = activeShooterLimit(params.playerUnits, params.playerUnits);
  const fireIntervalSeconds = averageFireIntervalSecondsForUnits(params.playerUnits);
  const hitEfficiency = 0.34;
  const totalShots = activeShooters * (params.timeToCollisionSeconds / fireIntervalSeconds);

  return totalShots * hitEfficiency;
}

export function calculateStartingNegativeCardValue(params: NegativeCardParams) {
  const progress = progressFor(params.distanceTravelled, params.targetRunDistance);
  const expectedHits = estimateExpectedHitsBeforeCollision(params);
  let desiredValueAtCollision: number;

  switch (params.difficulty) {
    case "repairable":
      desiredValueAtCollision = Math.ceil(1 + Math.sqrt(params.playerUnits) * (0.15 + 0.25 * progress));
      break;
    case "tax":
      desiredValueAtCollision = -Math.ceil(
        params.playerUnits * (0.04 + 0.06 * progress) + Math.sqrt(params.playerUnits) * (0.35 + 0.35 * progress)
      );
      break;
    case "threat":
      desiredValueAtCollision = -Math.ceil(
        params.playerUnits * (0.08 + 0.12 * progress) + Math.sqrt(params.playerUnits) * (0.55 + 0.55 * progress)
      );
      break;
    case "wall":
      desiredValueAtCollision = -Math.ceil(
        params.playerUnits * (0.14 + 0.18 * progress) + Math.sqrt(params.playerUnits) * (0.8 + 0.8 * progress)
      );
      break;
  }

  let startingValue = Math.floor(desiredValueAtCollision - expectedHits);
  startingValue = Math.min(startingValue, -1);

  const maximumReasonableMagnitude = Math.ceil(
    expectedHits * 1.6 + params.playerUnits * (0.9 + 0.5 * progress) + 10
  );

  return Math.max(startingValue, -maximumReasonableMagnitude);
}

export function calculatePositiveCardValue(params: PositiveCardParams) {
  const progress = progressFor(params.distanceTravelled, params.targetRunDistance);
  const jitter = params.random ? 0.82 + params.random() * 0.46 : 1;
  const value = Math.ceil((1 + Math.sqrt(params.playerUnits) * (0.25 + 0.35 * progress)) * jitter);

  return clamp(value, 1, 20);
}

export function generateBalancedCardRow(params: RowParams): BalancedCard[] {
  const progress = progressFor(params.distanceTravelled, params.targetRunDistance);
  const row = Array.from({ length: params.laneCount }, () => createNegativeCard(params, chooseDifficulty(progress, params.random)));
  const helpfulLane = Math.floor(params.random() * params.laneCount);

  if (params.random() < positiveChance(progress)) {
    row[helpfulLane] = createPositiveCard(params);
  } else {
    row[helpfulLane] = createNegativeCard(params, "repairable");
  }

  if (!isFairRow(row, params.playerUnits, progress)) {
    row[helpfulLane] = progress < 0.45 ? createPositiveCard(params) : createNegativeCard(params, "repairable");
  }

  return row;
}

export function generateBalancedCard(params: SingleCardParams): BalancedCard {
  const progress = progressFor(params.distanceTravelled, params.targetRunDistance);
  const roll = params.random();

  if (progress < 0.25) {
    return roll < 0.58 ? createPositiveCard(params) : createEarlyTrainingCard(params);
  }

  if (roll < positiveChance(progress)) {
    return createPositiveCard(params);
  }

  const difficulty = roll < positiveChance(progress) + 0.36 && progress < 0.55 ? "repairable" : chooseDifficulty(progress, params.random);
  const card = createNegativeCard(params, difficulty);

  if (progress < 0.62 && params.playerUnits + card.value <= 0) {
    return createEarlyTrainingCard(params);
  }

  if (params.playerUnits + card.estimatedValueAtCollision <= 0) {
    return progress < 0.35 ? createPositiveCard(params) : createNegativeCard(params, "repairable");
  }

  if (progress < 0.35 && card.estimatedValueAtCollision < -1) {
    return createNegativeCard(params, "repairable");
  }

  return card;
}

function createEarlyTrainingCard(params: SingleCardParams): BalancedCard {
  const expectedHits = estimateExpectedHitsBeforeCollision(params);
  const value = params.playerUnits <= 1 ? 1 : -1;

  return {
    value,
    difficulty: "repairable",
    expectedHits,
    estimatedValueAtCollision: value + expectedHits
  };
}

function createNegativeCard(params: SingleCardParams, difficulty: CardDifficulty): BalancedCard {
  const expectedHits = estimateExpectedHitsBeforeCollision(params);
  const value = calculateStartingNegativeCardValue({ ...params, difficulty });

  return {
    value,
    difficulty,
    expectedHits,
    estimatedValueAtCollision: value + expectedHits
  };
}

function createPositiveCard(params: PositiveCardParams): BalancedCard {
  const value = calculatePositiveCardValue(params);

  return {
    value,
    difficulty: "positive",
    expectedHits: 0,
    estimatedValueAtCollision: value
  };
}

function chooseDifficulty(progress: number, random: () => number): CardDifficulty {
  const weights =
    progress < 0.34
      ? [
          ["repairable", 0.55],
          ["tax", 0.3],
          ["threat", 0.15],
          ["wall", 0]
        ]
      : progress < 0.72
        ? [
            ["repairable", 0.35],
            ["tax", 0.35],
            ["threat", 0.25],
            ["wall", 0.05]
          ]
        : [
            ["repairable", 0.2],
            ["tax", 0.3],
            ["threat", 0.35],
            ["wall", 0.15]
          ];

  let roll = random();
  for (const [difficulty, weight] of weights as Array<[CardDifficulty, number]>) {
    roll -= weight;
    if (roll <= 0) {
      return difficulty;
    }
  }

  return "threat";
}

function isFairRow(row: BalancedCard[], playerUnits: number, progress: number) {
  const hasSurvivableLane = row.some((card) => playerUnits + card.estimatedValueAtCollision > 0);
  const hasGentleEarlyLane = progress >= 0.35 || row.some((card) => card.estimatedValueAtCollision >= -1);

  return hasSurvivableLane && hasGentleEarlyLane;
}

function positiveChance(progress: number) {
  if (progress < 0.34) {
    return 0.38;
  }
  if (progress < 0.72) {
    return 0.26;
  }
  return 0.16;
}

function progressFor(distanceTravelled: number, targetRunDistance: number) {
  return clamp(distanceTravelled / targetRunDistance, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
