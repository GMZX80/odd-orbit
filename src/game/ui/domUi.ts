import type { RunResult, RunStateSnapshot } from "../systems/runTypes";
import { convertRunnerSpheresToStrategicUnits } from "../systems/runnerStrategicConversion";

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing UI element #${id}`);
  }
  return element as T;
}

export function createDomUi() {
  const menu = getElement<HTMLElement>("menu-screen");
  const hud = getElement<HTMLElement>("hud");
  const result = getElement<HTMLElement>("result-screen");
  const startButton = getElement<HTMLButtonElement>("start-run");
  const retryButton = getElement<HTMLButtonElement>("retry-run");
  const units = getElement<HTMLElement>("hud-units");
  const distance = getElement<HTMLElement>("hud-distance");
  const lane = getElement<HTMLElement>("hud-lane");
  const route = getElement<HTMLElement>("hud-route");
  const stability = getElement<HTMLElement>("hud-stability");
  const objective = getElement<HTMLElement>("hud-objective");
  const resultMark = getElement<HTMLElement>("result-mark");
  const resultTitle = getElement<HTMLElement>("result-title");
  const resultCopy = getElement<HTMLElement>("result-copy");
  const resultRewards = getElement<HTMLElement>("result-rewards");

  return {
    onStart(handler: () => void) {
      startButton.addEventListener("click", handler);
    },

    onRetry(handler: () => void) {
      retryButton.addEventListener("click", handler);
    },

    showGalaxy() {
      menu.classList.remove("screen-visible");
      result.classList.remove("screen-visible");
      hud.classList.remove("hud-visible");
    },

    showHud() {
      menu.classList.remove("screen-visible");
      result.classList.remove("screen-visible");
      hud.classList.add("hud-visible");
    },

    renderHud(snapshot: RunStateSnapshot) {
      units.textContent = `Units: ${snapshot.units}`;
      distance.textContent = `Distance: ${snapshot.distance}m`;
      lane.textContent = `Lane: ${snapshot.selectedLaneName}`;
      route.textContent = `Route: ${snapshot.routeChargePercent}%`;
      stability.textContent = `Stable: ${snapshot.stabilityPercent}%`;
      objective.textContent = snapshot.objective;
    },

    flashUnitDamage() {
      units.classList.remove("hud-units-hit");
      void units.offsetWidth;
      units.classList.add("hud-units-hit");
    },

    showResult(runResult: RunResult, actionLabel = "Fly Again") {
      hud.classList.remove("hud-visible");
      result.classList.add("screen-visible");
      const stabilisedUnits = runResult.status === "complete" ? convertRunnerSpheresToStrategicUnits(runResult.finalUnits) : 0;
      resultMark.textContent = runResult.status === "complete" ? "Escaped" : "Game Over";
      resultTitle.textContent = runResult.status === "complete" ? "Wormhole Escape" : "Game Over";
      resultCopy.textContent = runResult.message;
      resultRewards.replaceChildren(
        reward("Distance", `${runResult.distance}m`),
        reward("Swarm", runResult.finalUnits),
        reward("Stabilised", stabilisedUnits)
      );
      retryButton.textContent = actionLabel;
    }
  };
}

function reward(label: string, value: string | number) {
  const container = document.createElement("div");
  const labelElement = document.createElement("span");
  const valueElement = document.createElement("strong");

  container.className = "reward-stat";
  labelElement.textContent = label;
  valueElement.textContent = String(value);
  container.append(labelElement, valueElement);

  return container;
}
