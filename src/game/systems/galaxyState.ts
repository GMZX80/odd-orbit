import { constellations, initialSystems } from "../data/galaxyMap";
import { routeEnemyThemeForFaction } from "./factionTheme";
import { getNpcPersonality, type NpcPersonality } from "./npcPersonalities";
import { convertRunnerSpheresToStrategicUnits } from "./runnerStrategicConversion";
import { getSystemTypeTraits } from "./systemTypeTraits";
import type {
  FactionId,
  GalaxyAction,
  GalaxyResolution,
  MoveOrder,
  StarSystem,
  StrategicArrivalEffect,
  StrategicArrivalOutcome,
  TurnLogEntry,
  TurnPhase,
  WormholeRunInput,
  WormholeRunResult
} from "./galaxyTypes";

const npcFactions: FactionId[] = ["crimson", "amber", "violet"];

let systems = cloneSystems(initialSystems);
let turnNumber = 1;
let turnPhase: TurnPhase = "deploy";
let currentFaction: FactionId = "player";
let deploymentUnitsRemaining = calculateDeployment("player");
let commandUsed = false;
let fortifyUsed = false;
let npcFactionIndex = 0;
let lastResolution: GalaxyResolution | undefined = {
  title: "Player Deployment",
  detail: `Place ${deploymentUnitsRemaining} new fleet units on blue systems.`
};
let turnLog: TurnLogEntry[] = [];
let logId = 1;
let gameOverStatus: "won" | "lost" | undefined;
let pendingStrategicArrivalEffect: StrategicArrivalEffect | undefined;

export function getGalaxySnapshot() {
  return {
    systems: cloneSystems(systems),
    constellations,
    turnNumber,
    turnPhase,
    currentFaction,
    deploymentUnitsRemaining,
    commandUsed,
    fortifyUsed,
    lastResolution,
    turnLog: [...turnLog],
    gameOverStatus
  };
}

export function getFactionName(faction: FactionId) {
  switch (faction) {
    case "player":
      return "You";
    case "crimson":
      return "Crimson Dominion";
    case "amber":
      return "Amber Combine";
    case "violet":
      return "Violet Accord";
    case "neutral":
      return "Neutral";
  }
}

export function findSystem(systemId: string) {
  return systems.find((system) => system.id === systemId);
}

export function consumePendingStrategicArrivalEffect() {
  const effect = pendingStrategicArrivalEffect;
  pendingStrategicArrivalEffect = undefined;
  return effect ? { ...effect } : undefined;
}

export function deployToSystem(systemId: string) {
  const system = findSystem(systemId);
  if (turnPhase !== "deploy" || deploymentUnitsRemaining <= 0 || !system || system.owner !== "player") {
    return false;
  }

  system.fleetUnits += 1;
  deploymentUnitsRemaining -= 1;
  pushLog("player", `Deployed 1 fleet unit to ${system.name}.`);

  if (deploymentUnitsRemaining <= 0) {
    enterFortifyPhase();
  } else {
    lastResolution = {
      title: "Player Deployment",
      detail: `${deploymentUnitsRemaining} deployment units remain.`
    };
  }

  return true;
}

export function skipDeployment() {
  if (turnPhase !== "deploy") {
    return false;
  }

  deploymentUnitsRemaining = 0;
  enterFortifyPhase();
  return true;
}

export function canCreateMoveOrder(originSystemId: string, destinationSystemId: string, unitsCommitted: number) {
  const origin = findSystem(originSystemId);
  const destination = findSystem(destinationSystemId);

  return Boolean(
    turnPhase === "command" &&
      !commandUsed &&
      origin &&
      destination &&
      origin.owner === "player" &&
      destination.owner !== "player" &&
      origin.neighbours.includes(destination.id) &&
      unitsCommitted === 1 &&
      origin.fleetUnits >= 2
  );
}

export function commitMoveOrder(order: MoveOrder): WormholeRunInput | undefined {
  if (!canCreateMoveOrder(order.originSystemId, order.destinationSystemId, order.unitsCommitted)) {
    return undefined;
  }

  const origin = findSystem(order.originSystemId);
  const destination = findSystem(order.destinationSystemId);
  if (!origin || !destination) {
    return undefined;
  }
  const destinationFactionId = destination.owner;
  const routeEnemyTheme = routeEnemyThemeForFaction(destinationFactionId);

  const seedUnitsCommitted = 1;
  origin.fleetUnits -= seedUnitsCommitted;
  commandUsed = true;
  lastResolution = {
    title: "Incursion Started",
    detail: `1 seed unit entered the ${origin.name}-${destination.name} starlane.`
  };
  pushLog("player", `Launched 1 seed unit from ${origin.name} to ${destination.name}.`);

  return {
    originSystemId: origin.id,
    destinationSystemId: destination.id,
    startingUnits: seedUnitsCommitted,
    routeDifficulty: difficultyForDestination(destination),
    destinationFactionId,
    destinationFactionColor: routeEnemyTheme.fill
  };
}

export function skipCommand() {
  if (turnPhase !== "command") {
    return false;
  }

  commandUsed = true;
  endPlayerTurn();
  lastResolution = {
    title: "Command Skipped",
    detail: "No incursion launched this turn."
  };
  pushLog("player", "Skipped command phase.");
  return true;
}

export function applyWormholeRunResult(input: WormholeRunInput, result: WormholeRunResult) {
  const origin = findSystem(input.originSystemId);
  const destination = findSystem(input.destinationSystemId);
  if (!origin || !destination) {
    return;
  }

  const survivors = Math.max(0, Math.floor(result.finalUnits));
  const destinationOwnerBefore = destination.owner;
  const defenderUnitsBefore = destination.fleetUnits;
  const originUnitsBefore = origin.fleetUnits + input.startingUnits;
  const originUnitsAfter = origin.fleetUnits;

  if (!result.escaped || survivors <= 0) {
    lastResolution = {
      title: "Incursion Failed",
      detail: `The seed unit was lost before reaching ${destination.name}.`
    };
    pushLog("player", lastResolution.detail);
    setStrategicArrivalEffect({
      input,
      resolutionMode: "play",
      rawRunnerSpheres: survivors,
      convertedStrategicUnits: 0,
      originUnitsBefore,
      originUnitsAfter,
      attackingUnitsCommitted: input.startingUnits,
      attackingUnitsSurvived: 0,
      defenderUnitsBefore,
      destinationOwnerBefore,
      destination,
      outcome: "failed",
      summaryLabel: "WORMHOLE FAILED"
    });
    endPlayerTurn();
    return;
  }

  const strategicArrivals = convertRunnerSpheresToStrategicUnits(survivors);

  if (destination.owner === "neutral") {
    destination.owner = "player";
    destination.fleetUnits = strategicArrivals;
    lastResolution = {
      title: "Sector Seeded",
      detail: `${destination.name} stabilised into a new blue sector.`
    };
    pushLog("player", lastResolution.detail);
    setStrategicArrivalEffect({
      input,
      resolutionMode: "play",
      rawRunnerSpheres: survivors,
      convertedStrategicUnits: strategicArrivals,
      originUnitsBefore,
      originUnitsAfter,
      attackingUnitsCommitted: input.startingUnits,
      attackingUnitsSurvived: strategicArrivals,
      defenderUnitsBefore,
      destinationOwnerBefore,
      destination,
      outcome: "neutralCaptured",
      summaryLabel: "WORMHOLE WIN"
    });
    endPlayerTurn();
    checkVictoryState();
    return;
  }

  if (destination.owner !== "player") {
    const previousOwner = destination.owner;
    destination.owner = "player";
    destination.fleetUnits = strategicArrivals;
    lastResolution = {
      title: "System Captured",
      detail: `${destination.name} fell from ${getFactionName(previousOwner)} with ${strategicArrivals} stabilised units holding orbit.`
    };
    setStrategicArrivalEffect({
      input,
      resolutionMode: "play",
      rawRunnerSpheres: survivors,
      convertedStrategicUnits: strategicArrivals,
      originUnitsBefore,
      originUnitsAfter,
      attackingUnitsCommitted: input.startingUnits,
      attackingUnitsSurvived: strategicArrivals,
      defenderUnitsBefore,
      destinationOwnerBefore,
      destination,
      outcome: "enemyCaptured",
      summaryLabel: "WORMHOLE WIN"
    });
    pushLog("player", lastResolution.detail);
    endPlayerTurn();
    checkVictoryState();
    return;
  }

  destination.fleetUnits += strategicArrivals;
  lastResolution = {
    title: "Fleet Arrived",
    detail: `${strategicArrivals} stabilised units reinforced ${destination.name}.`
  };
  pushLog("player", lastResolution.detail);
  setStrategicArrivalEffect({
    input,
    resolutionMode: "play",
    rawRunnerSpheres: survivors,
    convertedStrategicUnits: strategicArrivals,
    originUnitsBefore,
    originUnitsAfter,
    attackingUnitsCommitted: input.startingUnits,
    attackingUnitsSurvived: strategicArrivals,
    defenderUnitsBefore,
    destinationOwnerBefore,
    destination,
    outcome: "neutralCaptured",
    summaryLabel: "WORMHOLE WIN"
  });
  endPlayerTurn();
}

export function estimateAutoIncursionChance(originSystemId: string, destinationSystemId: string) {
  const origin = findSystem(originSystemId);
  const destination = findSystem(destinationSystemId);
  if (
    !origin ||
    !destination ||
    origin.owner !== "player" ||
    destination.owner === "player" ||
    !origin.neighbours.includes(destination.id) ||
    origin.fleetUnits < 2
  ) {
    return 0;
  }

  return calculateAutoIncursionChance(origin, destination);
}

export function autoResolveStrategicBattle(originSystemId: string, destinationSystemId: string) {
  if (turnPhase !== "command" || commandUsed) {
    return undefined;
  }

  const origin = findSystem(originSystemId);
  const destination = findSystem(destinationSystemId);
  if (
    !origin ||
    !destination ||
    origin.owner !== "player" ||
    destination.owner === "player" ||
    !origin.neighbours.includes(destination.id) ||
    origin.fleetUnits < 2
  ) {
    return undefined;
  }

  const destinationOwnerBefore = destination.owner;
  const originUnitsBefore = origin.fleetUnits;
  const defenderUnitsBefore = destination.fleetUnits;
  const routeDifficulty = difficultyForDestination(destination);
  const destinationFactionColor = routeEnemyThemeForFaction(destinationOwnerBefore).fill;
  const seedUnitsCommitted = 1;
  const successChance = calculateAutoIncursionChance(origin, destination);
  const effectiveDefence = calculateEffectiveDefence(destination);

  origin.fleetUnits -= seedUnitsCommitted;
  commandUsed = true;

  const captured = Math.random() < successChance;
  const outcome: StrategicArrivalOutcome = captured ? (destinationOwnerBefore === "neutral" ? "neutralCaptured" : "enemyCaptured") : "repelled";
  const autoRawSwarm = captured ? generateAutoRawSwarm(originUnitsBefore, defenderUnitsBefore, destination, effectiveDefence) : 0;
  const generatedStrategicUnits = captured
    ? convertRunnerSpheresToStrategicUnits(autoRawSwarm, {
        maxStrategicUnitsFromRun: 18
      })
    : 0;

  if (captured) {
    destination.owner = "player";
    destination.fleetUnits = generatedStrategicUnits;
    lastResolution = {
      title: "Auto Incursion",
      detail: `1 seed unit generated ${autoRawSwarm} unstable swarm, stabilising ${generatedStrategicUnits} units at ${destination.name}.`
    };
  } else {
    lastResolution = {
      title: "Repelled",
      detail: `The auto incursion lost its seed unit. ${destination.name} held with ${destination.fleetUnits} defenders.`
    };
  }
  pushLog("player", lastResolution.detail);

  const effect = setStrategicArrivalEffect({
    input: {
      originSystemId: origin.id,
      destinationSystemId: destination.id,
      startingUnits: seedUnitsCommitted,
      routeDifficulty,
      destinationFactionId: destinationOwnerBefore,
      destinationFactionColor
    },
    resolutionMode: "auto",
    rawRunnerSpheres: autoRawSwarm,
    convertedStrategicUnits: generatedStrategicUnits,
    autoSuccessChance: successChance,
    originUnitsBefore,
    originUnitsAfter: origin.fleetUnits,
    attackingUnitsCommitted: seedUnitsCommitted,
    attackingUnitsSurvived: generatedStrategicUnits,
    defenderUnitsBefore,
    destinationOwnerBefore,
    destination,
    outcome,
    summaryLabel: captured ? "AUTO INCURSION" : "REPELLED"
  });

  endPlayerTurn();
  checkVictoryState();
  return effect;
}

function setStrategicArrivalEffect(params: {
  input: WormholeRunInput;
  resolutionMode: "play" | "auto";
  rawRunnerSpheres?: number;
  convertedStrategicUnits: number;
  autoSuccessChance?: number;
  originUnitsBefore: number;
  originUnitsAfter: number;
  attackingUnitsCommitted: number;
  attackingUnitsSurvived: number;
  defenderUnitsBefore: number;
  destinationOwnerBefore: FactionId;
  destination: StarSystem;
  outcome: StrategicArrivalOutcome;
  summaryLabel: string;
}) {
  const {
    input,
    resolutionMode,
    rawRunnerSpheres,
    convertedStrategicUnits,
    autoSuccessChance,
    originUnitsBefore,
    originUnitsAfter,
    attackingUnitsCommitted,
    attackingUnitsSurvived,
    defenderUnitsBefore,
    destinationOwnerBefore,
    destination,
    outcome,
    summaryLabel
  } = params;

  pendingStrategicArrivalEffect = {
    originSystemId: input.originSystemId,
    destinationSystemId: input.destinationSystemId,
    resolutionMode,
    summaryLabel,
    originUnitsBefore,
    originUnitsAfter,
    attackingUnitsCommitted,
    attackingUnitsSurvived,
    rawRunnerSpheres,
    convertedStrategicUnits,
    autoSuccessChance,
    defenderUnitsBefore,
    defenderUnitsAfter: destination.fleetUnits,
    destinationUnitsAfter: destination.fleetUnits,
    destinationOwnerBefore,
    destinationOwnerAfter: destination.owner,
    outcome
  };
  return pendingStrategicArrivalEffect;
}

export function canFortifyMove(originSystemId: string, destinationSystemId: string, unitsCommitted: number) {
  const origin = findSystem(originSystemId);
  const destination = findSystem(destinationSystemId);

  return Boolean(
    turnPhase === "fortify" &&
      origin &&
      destination &&
      origin.owner === "player" &&
      destination.owner === "player" &&
      origin.neighbours.includes(destination.id) &&
      unitsCommitted >= 1 &&
      origin.fleetUnits - unitsCommitted >= 1
  );
}

export function hasAnyFortifyMove(faction: FactionId = "player") {
  const systemById = new Map(systems.map((system) => [system.id, system]));

  return systems.some(
    (origin) =>
      origin.owner === faction &&
      origin.fleetUnits > 1 &&
      origin.neighbours.some((neighbourId) => systemById.get(neighbourId)?.owner === faction)
  );
}

export function executeFortify(originSystemId: string, destinationSystemId: string, unitsCommitted: number) {
  if (!canFortifyMove(originSystemId, destinationSystemId, unitsCommitted)) {
    return false;
  }

  const origin = findSystem(originSystemId);
  const destination = findSystem(destinationSystemId);
  if (!origin || !destination) {
    return false;
  }

  origin.fleetUnits -= unitsCommitted;
  destination.fleetUnits += unitsCommitted;
  fortifyUsed = true;
  lastResolution = {
    title: "Fleet Redeployed",
    detail: `${unitsCommitted} fleet units moved from ${origin.name} to ${destination.name}.`
  };
  pushLog("player", lastResolution.detail);
  return true;
}

export function finishFortifyPhase() {
  if (turnPhase !== "fortify") {
    return false;
  }

  turnPhase = "command";
  lastResolution = {
    title: "Command Phase",
    detail: "Select a blue origin system and a connected non-blue sector for a one-seed incursion."
  };
  return true;
}

export function endPlayerTurn() {
  if (turnPhase === "gameOver") {
    return false;
  }

  turnPhase = "npcTurn";
  currentFaction = npcFactions[0];
  npcFactionIndex = 0;
  deploymentUnitsRemaining = 0;
  lastResolution = {
    title: "NPC Turns",
    detail: `${getFactionName(currentFaction)} is calculating something unpleasant.`
  };
  return true;
}

export function executeNextNpcTurn(): { action: GalaxyAction; completedRound: boolean } {
  if (turnPhase !== "npcTurn") {
    return {
      action: {
        title: "No NPC Turn",
        detail: "NPC factions are not active right now.",
        faction: currentFaction
      },
      completedRound: false
    };
  }

  if (npcFactionIndex >= npcFactions.length) {
    beginPlayerTurn();
    return {
      action: {
        title: "New Player Turn",
        detail: `Round ${turnNumber} begins. Deploy ${deploymentUnitsRemaining} fleet units.`,
        faction: "player"
      },
      completedRound: true
    };
  }

  const faction = npcFactions[npcFactionIndex];
  currentFaction = faction;
  const deployment = calculateDeployment(faction);
  const deployTarget = placeNpcDeployment(faction, deployment);
  const action = chooseAndExecuteNpcAction(faction, deployment, deployTarget);
  lastResolution = {
    title: action.title,
    detail: action.detail
  };
  pushLog(faction, `${action.title}: ${action.detail}`);
  npcFactionIndex += 1;
  checkVictoryState();

  if (gameOverStatus) {
    return { action, completedRound: true };
  }

  if (npcFactionIndex >= npcFactions.length) {
    return { action, completedRound: true };
  }

  currentFaction = npcFactions[npcFactionIndex];
  return { action, completedRound: false };
}

export function finishNpcRound() {
  if (turnPhase !== "npcTurn" || npcFactionIndex < npcFactions.length) {
    return false;
  }

  beginPlayerTurn();
  return true;
}

function beginPlayerTurn() {
  turnNumber += 1;
  turnPhase = "deploy";
  currentFaction = "player";
  deploymentUnitsRemaining = calculateDeployment("player");
  commandUsed = false;
  fortifyUsed = false;
  npcFactionIndex = 0;
  lastResolution = {
    title: "Player Deployment",
    detail: `Round ${turnNumber}. Place ${deploymentUnitsRemaining} new fleet units on blue systems.`
  };
}

function enterFortifyPhase() {
  turnPhase = "fortify";
  lastResolution = {
    title: "Redeploy Phase",
    detail: hasAnyFortifyMove("player") ? "Optionally move fleet units between connected blue systems." : "No legal redeploy is available. Press End to command."
  };
}

function calculateDeployment(faction: FactionId) {
  if (faction === "neutral") {
    return 0;
  }

  const owned = systems.filter((system) => system.owner === faction);
  if (owned.length === 0) {
    return 0;
  }

  const baseDeployment = Math.max(3, Math.floor(owned.length / 3));
  const systemProductionBonus = owned.reduce((bonus, system) => bonus + getSystemTypeTraits(system).productionBonus, 0);
  const constellationBonus = constellations.reduce((bonus, constellation) => {
    const constellationSystems = systems.filter((system) => system.constellationId === constellation.id);
    const controlsConstellation = constellationSystems.length > 0 && constellationSystems.every((system) => system.owner === faction);
    return controlsConstellation ? bonus + constellation.bonusUnits : bonus;
  }, 0);

  return baseDeployment + systemProductionBonus + constellationBonus;
}

function placeNpcDeployment(faction: FactionId, deployment: number) {
  const personality = getNpcPersonality(faction);
  const candidates = systems
    .filter((system) => system.owner === faction)
    .sort((a, b) => scoreNpcDeploymentTarget(faction, b, personality) - scoreNpcDeploymentTarget(faction, a, personality));
  const target = candidates[0];
  if (!target || deployment <= 0) {
    return undefined;
  }

  target.fleetUnits += deployment;
  return target;
}

function chooseAndExecuteNpcAction(faction: FactionId, deployment: number, deployTarget: StarSystem | undefined): GalaxyAction {
  const attackCandidate = bestNpcAttack(faction);
  if (attackCandidate) {
    return resolveNpcAttack(faction, attackCandidate.origin, attackCandidate.destination);
  }

  const personality = getNpcPersonality(faction);
  const reinforceTarget =
    deployTarget ??
    systems
      .filter((system) => system.owner === faction)
      .sort((a, b) => scoreNpcDeploymentTarget(faction, b, personality) - scoreNpcDeploymentTarget(faction, a, personality))[0];
  if (reinforceTarget) {
    reinforceTarget.fleetUnits += 1;
    return {
      title: `${getFactionName(faction)} Reinforces`,
      detail: `${getFactionName(faction)} reinforces ${reinforceTarget.name}${deployment > 0 ? ` after deploying ${deployment}` : ""}.`,
      faction,
      originSystemId: reinforceTarget.id
    };
  }

  return {
    title: `${getFactionName(faction)} Has No Systems`,
    detail: `${getFactionName(faction)} has no foothold this round.`,
    faction
  };
}

function bestNpcAttack(faction: FactionId) {
  const personality = getNpcPersonality(faction);
  const candidates = npcAttackCandidates(faction)
    .map((candidate) => ({
      ...candidate,
      score: scoreNpcAttackCandidate(faction, candidate.origin, candidate.destination, personality)
    }))
    .filter((candidate) => Number.isFinite(candidate.score) && candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0];
}

function npcAttackCandidates(faction: FactionId) {
  const byId = new Map(systems.map((system) => [system.id, system]));
  return systems
    .filter((origin) => origin.owner === faction && origin.fleetUnits > 1)
    .flatMap((origin) =>
      origin.neighbours
        .map((neighbourId) => byId.get(neighbourId))
        .filter((destination): destination is StarSystem => Boolean(destination && destination.owner !== faction))
        .map((destination) => ({ origin, destination }))
    );
}

function resolveNpcAttack(faction: FactionId, origin: StarSystem, destination: StarSystem): GalaxyAction {
  if (origin.owner !== faction || origin.fleetUnits < 2 || destination.owner === faction || !origin.neighbours.includes(destination.id)) {
    return {
      title: `${getFactionName(faction)} Holds Position`,
      detail: `${getFactionName(faction)} could not launch a valid one-seed incursion from ${origin.name}.`,
      faction,
      originSystemId: origin.id
    };
  }

  const seedUnitsCommitted = 1;
  const originUnitsBefore = origin.fleetUnits;
  const defenderUnitsBefore = destination.fleetUnits;
  const previousOwner = destination.owner;
  const effectiveDefence = calculateEffectiveDefence(destination);
  const successChance = calculateAutoIncursionChance(origin, destination);

  origin.fleetUnits -= seedUnitsCommitted;
  const captured = Math.random() < successChance;

  if (captured) {
    const autoRawSwarm = generateAutoRawSwarm(originUnitsBefore, defenderUnitsBefore, destination, effectiveDefence);
    const generatedStrategicUnits = convertRunnerSpheresToStrategicUnits(autoRawSwarm, {
      maxStrategicUnitsFromRun: 18
    });
    destination.owner = faction;
    destination.fleetUnits = generatedStrategicUnits;
    return {
      title: `${getFactionName(faction)} Captures ${destination.name}`,
      detail: `${getFactionName(faction)} launches a one-seed incursion from ${origin.name}. ${destination.name} changes hands from ${getFactionName(previousOwner)} with ${generatedStrategicUnits} stabilised units.`,
      faction,
      originSystemId: origin.id,
      destinationSystemId: destination.id
    };
  }

  return {
    title: `${getFactionName(faction)} Pressures ${destination.name}`,
    detail: `${getFactionName(faction)} launches a one-seed incursion from ${origin.name}. ${destination.name} repels the seed unit and holds with ${destination.fleetUnits} defenders.`,
    faction,
    originSystemId: origin.id,
    destinationSystemId: destination.id
  };
}

function npcBattleScore(origin: StarSystem, destination: StarSystem) {
  if (origin.fleetUnits < 2 || origin.owner === destination.owner || !origin.neighbours.includes(destination.id)) {
    return 0;
  }

  return calculateAutoIncursionChance(origin, destination);
}

function scoreNpcAttackCandidate(faction: FactionId, origin: StarSystem, destination: StarSystem, personality: NpcPersonality) {
  const successChance = npcBattleScore(origin, destination);
  if (successChance < personality.minAttackWinChance) {
    return -Infinity;
  }

  const weakTargetValue = clamp((14 - Math.max(0, destination.fleetUnits)) / 14, 0, 1);
  const originPressure = normalizedBorderPressure(origin, faction);
  const ownerValue =
    destination.owner === "player"
      ? 0.45 + personality.playerHostility * 1.4 + personality.aggression * 0.45
      : destination.owner === "neutral"
        ? 0.35 + personality.expansionBias * 1.45 + personality.resourceGreed * 0.15
        : 0.2 + personality.aggression * 0.55 + personality.opportunism * 0.35;
  const oddsValue =
    (successChance - personality.minAttackWinChance) * (2.6 + personality.riskTolerance) +
    Math.max(0, successChance - personality.preferredAttackWinChance) * (1.7 + personality.caution);
  const resourceValue = (destination.resourceValue / 4) * personality.resourceGreed;
  const constellationValue = constellationProgressValue(faction, destination) * personality.constellationGreed;
  const destinationTraits = getSystemTypeTraits(destination);
  const typeValue =
    destinationTraits.strategicValue * (0.35 + personality.fortressPreference * 0.75 + personality.resourceGreed * 0.2) +
    destinationTraits.productionBonus * (personality.expansionBias * 0.28 + personality.resourceGreed * 0.32);
  const opportunityValue = weakTargetValue * (0.4 + personality.opportunism * 1.15);
  const defensivePenalty = originPressure * personality.defensiveBias * personality.caution * 0.7;
  const randomNudge = Math.random() * personality.randomness;

  return (
    ownerValue +
    oddsValue +
    resourceValue +
    constellationValue +
    typeValue +
    opportunityValue +
    personality.aggression * 0.28 +
    randomNudge -
    defensivePenalty
  );
}

function scoreNpcDeploymentTarget(faction: FactionId, system: StarSystem, personality: NpcPersonality) {
  const pressure = normalizedBorderPressure(system, faction);
  const resourceValue = (system.resourceValue / 4) * personality.resourceGreed;
  const constellationValue = constellationProgressValue(faction, system) * personality.constellationGreed;
  const traits = getSystemTypeTraits(system);
  const typeValue =
    traits.strategicValue * (0.25 + personality.fortressPreference * 0.95 + personality.defensiveBias * 0.35) +
    traits.productionBonus * (0.32 + personality.resourceGreed * 0.45 + personality.expansionBias * 0.22);
  const weakGarrisonNeed = clamp((10 - system.fleetUnits) / 10, 0, 1) * (0.35 + personality.defensiveBias);
  const attackReadiness = system.fleetUnits > 1 ? 0 : 0.35 + personality.aggression * 0.3;
  const randomNudge = Math.random() * personality.randomness;

  return (
    pressure * (0.65 + personality.borderSensitivity * 1.6 + personality.defensiveBias) +
    resourceValue +
    constellationValue +
    typeValue +
    weakGarrisonNeed +
    attackReadiness +
    randomNudge -
    personality.aggression * 0.12
  );
}

function constellationProgressValue(faction: FactionId, destination: StarSystem) {
  const constellationSystems = systems.filter((system) => system.constellationId === destination.constellationId);
  if (constellationSystems.length === 0) {
    return 0;
  }

  const ownedCount = constellationSystems.filter((system) => system.owner === faction).length;
  const wouldComplete = destination.owner !== faction && ownedCount === constellationSystems.length - 1;
  const progress = ownedCount / constellationSystems.length;
  const bonus = constellations.find((constellation) => constellation.id === destination.constellationId)?.bonusUnits ?? 0;

  return clamp(progress + bonus * 0.08 + (wouldComplete ? 0.85 : 0), 0, 1.8);
}

function normalizedBorderPressure(system: StarSystem, faction: FactionId) {
  return clamp(borderPressure(system, faction) / 28, 0, 1.6);
}

function borderPressure(system: StarSystem, faction: FactionId) {
  return system.neighbours.reduce((pressure, neighbourId) => {
    const neighbour = findSystem(neighbourId);
    return pressure + (neighbour && neighbour.owner !== faction ? Math.max(1, neighbour.fleetUnits) : 0);
  }, 0);
}

function difficultyForDestination(destination: StarSystem) {
  if (destination.systemType === "fortress" || (destination.owner !== "player" && destination.owner !== "neutral" && destination.fleetUnits >= 18)) {
    return "hard";
  }
  if (destination.owner !== "player" && destination.owner !== "neutral") {
    return "normal";
  }
  if (destination.systemType === "rift" || destination.fleetUnits >= 12) {
    return "normal";
  }
  return "easy";
}

function calculateAutoIncursionChance(origin: StarSystem, destination: StarSystem) {
  const effectiveDefence = calculateEffectiveDefence(destination);
  const originSupportBonus = Math.min(0.12, Math.sqrt(Math.max(0, origin.fleetUnits)) * 0.025);
  const neutralBonus = destination.owner === "neutral" ? 0.1 : 0;
  const originTypeBonus = getSystemTypeTraits(origin).attackBonus;

  return clamp(0.78 - effectiveDefence * 0.035 + originSupportBonus + neutralBonus + originTypeBonus, 0.12, 0.88);
}

function calculateEffectiveDefence(destination: StarSystem) {
  const ownerModifier = destination.owner === "neutral" ? 0.75 : 1;
  const systemModifier = getSystemTypeTraits(destination).defenceModifier;

  return Math.max(0, destination.fleetUnits) * ownerModifier * systemModifier;
}

function generateAutoRawSwarm(originUnitsBefore: number, defenderUnitsBefore: number, destination: StarSystem, effectiveDefence: number) {
  const originSupport = Math.sqrt(Math.max(1, originUnitsBefore)) * 3;
  const defenceReward = Math.sqrt(Math.max(0, defenderUnitsBefore)) * 2.6;
  const neutralLift = destination.owner === "neutral" ? 8 : 0;
  const typeDefencePenalty = Math.max(0, getSystemTypeTraits(destination).defenceModifier - 1) * 18;
  const randomSwing = randomInt(-6, 18);
  const rawSwarm = Math.round(10 + originSupport + defenceReward + neutralLift + randomSwing - effectiveDefence * 0.45 - typeDefencePenalty);

  return Math.round(clamp(rawSwarm, 1, 120));
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function checkVictoryState() {
  const playerOwned = systems.filter((system) => system.owner === "player");
  if (playerOwned.length === 0) {
    turnPhase = "gameOver";
    currentFaction = "player";
    gameOverStatus = "lost";
    lastResolution = {
      title: "Faction Scattered",
      detail: "Your faction no longer controls a star system."
    };
    return;
  }

  if (playerOwned.length === systems.length) {
    turnPhase = "gameOver";
    currentFaction = "player";
    gameOverStatus = "won";
    lastResolution = {
      title: "Galaxy Secured",
      detail: "Every known star system now answers to your questionable command."
    };
    return;
  }

  if (playerOwned.length >= 5) {
    turnPhase = "gameOver";
    currentFaction = "player";
    gameOverStatus = "won";
    lastResolution = {
      title: "Route Secured",
      detail: "Your faction controls enough linked star systems to call this odd orbit a success."
    };
  }
}

function pushLog(faction: FactionId, message: string) {
  turnLog = [{ id: logId++, faction, message }, ...turnLog].slice(0, 7);
}

function cloneSystems(source: StarSystem[]) {
  return source.map((system) => ({ ...system, neighbours: [...system.neighbours] }));
}
