import { constellations, initialSystems } from "../data/galaxyMap";
import { routeEnemyThemeForFaction } from "./factionTheme";
import { convertRunnerSpheresToStrategicUnits } from "./runnerStrategicConversion";
import type {
  FactionId,
  GalaxyAction,
  GalaxyResolution,
  MoveOrder,
  RouteDifficulty,
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
    detail: "Optionally move fleet units between connected blue systems."
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
  const constellationBonus = constellations.reduce((bonus, constellation) => {
    const constellationSystems = systems.filter((system) => system.constellationId === constellation.id);
    const controlsConstellation = constellationSystems.length > 0 && constellationSystems.every((system) => system.owner === faction);
    return controlsConstellation ? bonus + constellation.bonusUnits : bonus;
  }, 0);

  return baseDeployment + constellationBonus;
}

function placeNpcDeployment(faction: FactionId, deployment: number) {
  const candidates = systems
    .filter((system) => system.owner === faction)
    .sort((a, b) => borderPressure(b, faction) - borderPressure(a, faction) || a.fleetUnits - b.fleetUnits);
  const target = candidates[0];
  if (!target || deployment <= 0) {
    return undefined;
  }

  target.fleetUnits += deployment;
  return target;
}

function chooseAndExecuteNpcAction(faction: FactionId, deployment: number, deployTarget: StarSystem | undefined): GalaxyAction {
  const captureCandidate = bestNpcAttack(faction, true);
  if (captureCandidate) {
    return resolveNpcAttack(faction, captureCandidate.origin, captureCandidate.destination);
  }

  const expansionCandidate = bestNpcExpansion(faction);
  if (expansionCandidate) {
    return resolveNpcAttack(faction, expansionCandidate.origin, expansionCandidate.destination);
  }

  const reinforceTarget = deployTarget ?? systems.filter((system) => system.owner === faction).sort((a, b) => borderPressure(b, faction) - borderPressure(a, faction))[0];
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

function bestNpcAttack(faction: FactionId, requireCapture: boolean) {
  return npcAttackCandidates(faction)
    .filter((candidate) => !requireCapture || npcBattleScore(candidate.origin, candidate.destination) >= 0.58 || candidate.destination.fleetUnits <= 0)
    .sort((a, b) => {
      const aPlayerPriority = a.destination.owner === "player" ? 2 : a.destination.owner === "neutral" ? 1 : 0;
      const bPlayerPriority = b.destination.owner === "player" ? 2 : b.destination.owner === "neutral" ? 1 : 0;
      return bPlayerPriority - aPlayerPriority || npcBattleScore(b.origin, b.destination) - npcBattleScore(a.origin, a.destination);
    })[0];
}

function bestNpcExpansion(faction: FactionId) {
  return npcAttackCandidates(faction)
    .filter((candidate) => candidate.destination.owner === "neutral")
    .sort((a, b) => b.origin.fleetUnits - a.origin.fleetUnits || a.destination.fleetUnits - b.destination.fleetUnits)[0];
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
  const committed = Math.max(0, origin.fleetUnits - 1);
  const battle = resolveStrategicBattle(committed, Math.max(0, destination.fleetUnits));
  const previousOwner = destination.owner;
  origin.fleetUnits = 1;

  if (battle.captured) {
    destination.owner = faction;
    destination.fleetUnits = battle.attackersRemaining;
    return {
      title: `${getFactionName(faction)} Captures ${destination.name}`,
      detail: `${committed} units crossed from ${origin.name}. ${destination.name} changed hands from ${getFactionName(previousOwner)}.`,
      faction,
      originSystemId: origin.id,
      destinationSystemId: destination.id
    };
  }

  destination.fleetUnits = battle.defendersRemaining;
  return {
    title: `${getFactionName(faction)} Pressures ${destination.name}`,
    detail: `${committed} units crossed from ${origin.name}. ${destination.name} holds with ${destination.fleetUnits} units.`,
    faction,
    originSystemId: origin.id,
    destinationSystemId: destination.id
  };
}

function npcBattleScore(origin: StarSystem, destination: StarSystem) {
  const attackingUnits = Math.max(0, origin.fleetUnits - 1);
  const defenderUnits = Math.max(0, destination.fleetUnits);
  const seed = stableBattleSeed(origin.id, destination.id, attackingUnits, defenderUnits);
  return estimateBattleWinChance(attackingUnits, defenderUnits, seed);
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
  const fortressPenalty = destination.systemType === "fortress" ? 0.1 : 0;

  return clamp(0.78 - effectiveDefence * 0.035 + originSupportBonus + neutralBonus - fortressPenalty, 0.12, 0.88);
}

function calculateEffectiveDefence(destination: StarSystem) {
  const routeDifficulty = difficultyForDestination(destination);
  const routeModifier = routeDifficultyModifier(routeDifficulty);
  const ownerModifier = destination.owner === "neutral" ? 0.75 : 1;
  const systemModifier = systemTypeModifier(destination);

  return Math.max(0, destination.fleetUnits) * routeModifier * ownerModifier * systemModifier;
}

function routeDifficultyModifier(routeDifficulty: RouteDifficulty) {
  switch (routeDifficulty) {
    case "easy":
      return 0.85;
    case "hard":
      return 1.25;
    case "normal":
    default:
      return 1;
  }
}

function systemTypeModifier(destination: StarSystem) {
  switch (destination.systemType) {
    case "frontier":
      return 0.9;
    case "rift":
      return 1.1;
    case "core":
      return 1.15;
    case "fortress":
      return 1.3;
    case "mining":
    default:
      return 1;
  }
}

function generateAutoRawSwarm(originUnitsBefore: number, defenderUnitsBefore: number, destination: StarSystem, effectiveDefence: number) {
  const routeDifficulty = difficultyForDestination(destination);
  const originSupport = Math.sqrt(Math.max(1, originUnitsBefore)) * 3;
  const defenceReward = Math.sqrt(Math.max(0, defenderUnitsBefore)) * 2.6;
  const difficultyPenalty = routeDifficulty === "hard" ? 10 : routeDifficulty === "normal" ? 5 : 0;
  const neutralLift = destination.owner === "neutral" ? 8 : 0;
  const fortressPenalty = destination.systemType === "fortress" ? 6 : 0;
  const randomSwing = randomInt(-6, 18);
  const rawSwarm = Math.round(10 + originSupport + defenceReward + neutralLift + randomSwing - effectiveDefence * 0.45 - difficultyPenalty - fortressPenalty);

  return Math.round(clamp(rawSwarm, 1, 120));
}

function resolveStrategicBattle(attackingUnitsInput: number, defenderUnitsInput: number, rng: () => number = Math.random) {
  let attackersRemaining = Math.max(0, Math.floor(attackingUnitsInput));
  let defendersRemaining = Math.max(0, Math.floor(defenderUnitsInput));

  while (attackersRemaining > 0 && defendersRemaining > 0) {
    const attackerDice = rollBattleDice(Math.min(3, attackersRemaining), rng);
    const defenderDice = rollBattleDice(Math.min(2, defendersRemaining), rng);
    const comparisons = Math.min(attackerDice.length, defenderDice.length);

    for (let index = 0; index < comparisons; index += 1) {
      if (attackerDice[index] > defenderDice[index]) {
        defendersRemaining -= 1;
      } else {
        attackersRemaining -= 1;
      }

      if (attackersRemaining <= 0 || defendersRemaining <= 0) {
        break;
      }
    }
  }

  return {
    captured: attackersRemaining > 0 && defendersRemaining <= 0,
    attackersRemaining,
    defendersRemaining
  };
}

function estimateBattleWinChance(attackingUnits: number, defenderUnits: number, seed: number) {
  if (attackingUnits <= 0) {
    return 0;
  }
  if (defenderUnits <= 0) {
    return 1;
  }

  const trials = 180;
  let wins = 0;
  const rng = createSeededRng(seed);
  for (let index = 0; index < trials; index += 1) {
    if (resolveStrategicBattle(attackingUnits, defenderUnits, rng).captured) {
      wins += 1;
    }
  }
  return clamp(wins / trials, 0.02, 0.98);
}

function rollBattleDice(count: number, rng: () => number) {
  return Array.from({ length: count }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => b - a);
}

function stableBattleSeed(originId: string, destinationId: string, attackingUnits: number, defenderUnits: number) {
  const source = `${originId}:${destinationId}:${attackingUnits}:${defenderUnits}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
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
  }
}

function pushLog(faction: FactionId, message: string) {
  turnLog = [{ id: logId++, faction, message }, ...turnLog].slice(0, 7);
}

function cloneSystems(source: StarSystem[]) {
  return source.map((system) => ({ ...system, neighbours: [...system.neighbours] }));
}
