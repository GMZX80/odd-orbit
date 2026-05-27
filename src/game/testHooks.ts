import type Phaser from "phaser";
import {
  autoResolveStrategicBattle,
  canCreateMoveOrder,
  canFortifyMove,
  commitMoveOrder,
  deployToSystem,
  executeFortify,
  executeNextNpcTurn,
  finishFortifyPhase,
  finishNpcRound,
  getGalaxySnapshot,
  skipCommand,
  skipDeployment
} from "./systems/galaxyState";
import type { RunResult, RunStateSnapshot } from "./systems/runTypes";
import type { WormholeRunInput } from "./systems/galaxyTypes";
import { TRAVEL_RUN } from "./travel/travelConfig";

type SceneName = "galaxy" | "travel" | "unknown";

interface OddOrbitTestHookOptions {
  game: Phaser.Game;
  startRun: (startingUnits?: number, runInput?: WormholeRunInput) => void;
  showGalaxyMap: () => void;
  getRunSnapshot: () => RunStateSnapshot | undefined;
  getLastRunResult: () => RunResult | undefined;
}

interface OddOrbitTestActionResult {
  ok: boolean;
  message: string;
  state: OddOrbitTestState;
}

export interface OddOrbitTestState {
  enabled: true;
  scene: SceneName;
  galaxy: ReturnType<typeof getGalaxySnapshot>;
  run?: RunStateSnapshot;
  lastRunResult?: RunResult;
  legalActions: string[];
}

declare global {
  interface Window {
    __ODD_ORBIT_TEST__?: {
      getState: () => OddOrbitTestState;
      deploy: (systemId: string) => OddOrbitTestActionResult;
      skipDeployment: () => OddOrbitTestActionResult;
      finishFortify: () => OddOrbitTestActionResult;
      fortify: (originSystemId: string, destinationSystemId: string, unitsCommitted: number) => OddOrbitTestActionResult;
      autoResolve: (originSystemId: string, destinationSystemId: string) => OddOrbitTestActionResult;
      startWormholeRun: (originSystemId: string, destinationSystemId: string) => OddOrbitTestActionResult;
      skipCommand: () => OddOrbitTestActionResult;
      executeNpcRound: () => OddOrbitTestActionResult;
      setTravelLane: (lane: number) => OddOrbitTestActionResult;
      expireTravelTimer: () => OddOrbitTestActionResult;
      showGalaxy: () => OddOrbitTestActionResult;
    };
  }
}

export function shouldEnableOddOrbitTestHooks() {
  return import.meta.env.MODE === "development" || new URLSearchParams(window.location.search).get("testHooks") === "1";
}

export function installOddOrbitTestHooks(options: OddOrbitTestHookOptions) {
  if (!shouldEnableOddOrbitTestHooks()) {
    return;
  }

  const state = (): OddOrbitTestState => ({
    enabled: true,
    scene: currentScene(options.game),
    galaxy: getGalaxySnapshot(),
    run: currentScene(options.game) === "travel" ? options.getRunSnapshot() : undefined,
    lastRunResult: options.getLastRunResult(),
    legalActions: legalActions(options.game)
  });

  const finish = (ok: boolean, message: string): OddOrbitTestActionResult => {
    rerenderGalaxy(options.game);
    return { ok, message, state: state() };
  };

  window.__ODD_ORBIT_TEST__ = {
    getState: state,
    deploy: (systemId) => finish(deployToSystem(systemId), `deploy:${systemId}`),
    skipDeployment: () => finish(skipDeployment(), "skip-deployment"),
    finishFortify: () => finish(finishFortifyPhase(), "finish-fortify"),
    fortify: (originSystemId, destinationSystemId, unitsCommitted) =>
      finish(executeFortify(originSystemId, destinationSystemId, unitsCommitted), `fortify:${originSystemId}:${destinationSystemId}:${unitsCommitted}`),
    autoResolve: (originSystemId, destinationSystemId) =>
      finish(Boolean(autoResolveStrategicBattle(originSystemId, destinationSystemId)), `auto-resolve:${originSystemId}:${destinationSystemId}`),
    startWormholeRun: (originSystemId, destinationSystemId) => {
      const runInput = commitMoveOrder({ originSystemId, destinationSystemId, unitsCommitted: 1 });
      if (!runInput) {
        return finish(false, `start-run-blocked:${originSystemId}:${destinationSystemId}`);
      }
      options.startRun(runInput.startingUnits, runInput);
      return { ok: true, message: `start-run:${originSystemId}:${destinationSystemId}`, state: state() };
    },
    skipCommand: () => finish(skipCommand(), "skip-command"),
    executeNpcRound: () => {
      const before = getGalaxySnapshot();
      if (before.turnPhase !== "npcTurn") {
        return finish(false, "npc-round-not-active");
      }

      let completedRound = false;
      let guard = 0;
      while (!completedRound && guard < 8) {
        completedRound = executeNextNpcTurn().completedRound;
        guard += 1;
      }
      if (completedRound) {
        finishNpcRound();
      }
      return finish(completedRound, completedRound ? "npc-round-complete" : "npc-round-incomplete");
    },
    setTravelLane: (lane) => {
      const scene = options.game.scene.getScene("TravelScene") as unknown as { selectedLane?: number };
      scene.selectedLane = Math.max(0, Math.min(2, Math.round(lane)));
      return { ok: true, message: `travel-lane:${scene.selectedLane}`, state: state() };
    },
    expireTravelTimer: () => {
      const scene = options.game.scene.getScene("TravelScene") as unknown as { runStartedAtMs?: number; time?: { now: number } };
      if (!scene.time) {
        return finish(false, "travel-timer-unavailable");
      }
      scene.runStartedAtMs = scene.time.now - TRAVEL_RUN.timeLimitMs - 1;
      return { ok: true, message: "travel-timer-expired", state: state() };
    },
    showGalaxy: () => {
      options.showGalaxyMap();
      return finish(true, "show-galaxy");
    }
  };
}

function currentScene(game: Phaser.Game): SceneName {
  if (game.scene.isActive("TravelScene")) return "travel";
  if (game.scene.isActive("GalaxyMapScene")) return "galaxy";
  return "unknown";
}

function rerenderGalaxy(game: Phaser.Game) {
  const scene = game.scene.getScene("GalaxyMapScene") as unknown as { render?: () => void };
  scene.render?.();
}

function legalActions(game: Phaser.Game) {
  if (currentScene(game) === "travel") {
    return ["travel-lane:0", "travel-lane:1", "travel-lane:2"];
  }

  const snapshot = getGalaxySnapshot();
  if (snapshot.turnPhase === "deploy") {
    return snapshot.systems.filter((system) => system.owner === "player").map((system) => `deploy:${system.id}`);
  }

  if (snapshot.turnPhase === "fortify") {
    const actions = ["finish-fortify"];
    for (const origin of snapshot.systems.filter((system) => system.owner === "player" && system.fleetUnits > 1)) {
      for (const destinationId of origin.neighbours) {
        if (canFortifyMove(origin.id, destinationId, 1)) {
          actions.push(`fortify:${origin.id}:${destinationId}:1`);
        }
      }
    }
    return actions;
  }

  if (snapshot.turnPhase === "command") {
    const actions = ["skip-command"];
    for (const origin of snapshot.systems.filter((system) => system.owner === "player" && system.fleetUnits > 1)) {
      for (const destinationId of origin.neighbours) {
        if (canCreateMoveOrder(origin.id, destinationId, 1)) {
          actions.push(`auto-resolve:${origin.id}:${destinationId}`, `start-run:${origin.id}:${destinationId}`);
        }
      }
    }
    return actions;
  }

  if (snapshot.turnPhase === "npcTurn") {
    return ["execute-npc-round"];
  }

  return [];
}
