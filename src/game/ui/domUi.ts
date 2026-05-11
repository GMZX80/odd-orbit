import type { RunResult, RunStateSnapshot } from "../systems/runTypes";

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

    showHud() {
      menu.classList.remove("screen-visible");
      result.classList.remove("screen-visible");
      hud.classList.add("hud-visible");
    },

    renderHud(snapshot: RunStateSnapshot) {
      units.textContent = `Units: ${snapshot.units}`;
      distance.textContent = `Distance: ${snapshot.distance}m`;
    },

    showResult(runResult: RunResult) {
      hud.classList.remove("hud-visible");
      result.classList.add("screen-visible");
      resultMark.textContent = runResult.status === "complete" ? "Run Complete" : "Game Over";
      resultTitle.textContent = runResult.status === "complete" ? "Run Complete" : "Game Over";
      resultCopy.textContent = runResult.message;
      resultRewards.innerHTML = [
        reward("Distance", `${runResult.distance}m`),
        reward("Final Units", runResult.units)
      ].join("");
    }
  };
}

function reward(label: string, value: string | number) {
  return `<div class="reward-stat"><span>${label}</span><strong>${value}</strong></div>`;
}
