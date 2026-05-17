import type { FactionId } from "./galaxyTypes";

export interface NpcPersonality {
  aggression: number;
  riskTolerance: number;
  defensiveBias: number;
  expansionBias: number;
  playerHostility: number;
  resourceGreed: number;
  constellationGreed: number;
  fortressPreference: number;
  borderSensitivity: number;
  opportunism: number;
  caution: number;
  randomness: number;
  minAttackWinChance: number;
  preferredAttackWinChance: number;
}

export const npcPersonalities: Record<Exclude<FactionId, "player" | "neutral">, NpcPersonality> = {
  crimson: {
    aggression: 0.9,
    riskTolerance: 0.75,
    defensiveBias: 0.25,
    expansionBias: 0.45,
    playerHostility: 0.75,
    resourceGreed: 0.45,
    constellationGreed: 0.35,
    fortressPreference: 0.5,
    borderSensitivity: 0.5,
    opportunism: 0.75,
    caution: 0.2,
    randomness: 0.18,
    minAttackWinChance: 0.48,
    preferredAttackWinChance: 0.58
  },
  amber: {
    aggression: 0.45,
    riskTolerance: 0.35,
    defensiveBias: 0.45,
    expansionBias: 0.9,
    playerHostility: 0.35,
    resourceGreed: 0.9,
    constellationGreed: 0.75,
    fortressPreference: 0.35,
    borderSensitivity: 0.55,
    opportunism: 0.6,
    caution: 0.55,
    randomness: 0.12,
    minAttackWinChance: 0.62,
    preferredAttackWinChance: 0.72
  },
  violet: {
    aggression: 0.35,
    riskTolerance: 0.2,
    defensiveBias: 0.9,
    expansionBias: 0.45,
    playerHostility: 0.45,
    resourceGreed: 0.5,
    constellationGreed: 0.65,
    fortressPreference: 0.85,
    borderSensitivity: 0.9,
    opportunism: 0.5,
    caution: 0.85,
    randomness: 0.08,
    minAttackWinChance: 0.68,
    preferredAttackWinChance: 0.78
  }
};

export function getNpcPersonality(faction: FactionId) {
  if (faction === "crimson" || faction === "amber" || faction === "violet") {
    return npcPersonalities[faction];
  }

  return npcPersonalities.crimson;
}
