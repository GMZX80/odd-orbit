export const visibleShooterCap = 30;

const baseFireIntervalMs = 440;
const minimumFireIntervalMs = 250;
const averageShooterJitterMs = 45;

export function activeShooterLimit(playerUnits: number, visibleUnitCount: number) {
  return Math.min(Math.max(0, Math.floor(playerUnits)), visibleShooterCap, visibleUnitCount);
}

export function fireIntervalMsForUnits(playerUnits: number, jitterMs = 0) {
  const units = Math.max(1, playerUnits);
  const cappedShooters = Math.min(units, visibleShooterCap);
  const cadenceBonus = Math.min(190, Math.sqrt(units) * 17 + cappedShooters * 2.4);

  return Math.max(minimumFireIntervalMs, baseFireIntervalMs - cadenceBonus) + jitterMs;
}

export function averageFireIntervalSecondsForUnits(playerUnits: number) {
  return fireIntervalMsForUnits(playerUnits, averageShooterJitterMs) / 1000;
}

export function wormholeAbsorptionCapForUnits(playerUnits: number) {
  const units = Math.max(1, playerUnits);
  const cap = 6 + Math.sqrt(units) * 0.45 + Math.min(units, 80) * 0.018;

  return clamp(cap, 7, 14);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
