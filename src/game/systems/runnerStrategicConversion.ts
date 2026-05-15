const conversionExponent = 0.6;
const defaultSettlementMultiplier = 1.15;
const defaultMaxStrategicUnitsFromRun = 120;

interface RunnerStrategicConversionOptions {
  settlementMultiplier?: number;
  maxStrategicUnitsFromRun?: number;
}

export function convertRunnerSpheresToStrategicUnits(finalRunnerSpheres: number, options?: RunnerStrategicConversionOptions) {
  const safeSpheres = Math.max(0, Math.floor(finalRunnerSpheres));
  if (safeSpheres <= 0) {
    return 0;
  }

  const settlementMultiplier = options?.settlementMultiplier ?? defaultSettlementMultiplier;
  const maxStrategicUnitsFromRun = options?.maxStrategicUnitsFromRun ?? defaultMaxStrategicUnitsFromRun;
  const converted = Math.round(Math.pow(safeSpheres, conversionExponent) * settlementMultiplier);

  return clamp(converted, 1, maxStrategicUnitsFromRun);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
