import type { PlayerProfile } from "../services/userDataService";
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
  const profileStrip = getElement<HTMLElement>("profile-strip");
  const destination = getElement<HTMLElement>("hud-destination");
  const distance = getElement<HTMLElement>("hud-distance");
  const coins = getElement<HTMLElement>("hud-coins");
  const fuel = getElement<HTMLElement>("hud-fuel");
  const health = getElement<HTMLElement>("hud-health");
  const eventText = getElement<HTMLElement>("hud-event");
  const resultMark = getElement<HTMLElement>("result-mark");
  const resultTitle = getElement<HTMLElement>("result-title");
  const resultCopy = getElement<HTMLElement>("result-copy");
  const resultRewards = getElement<HTMLElement>("result-rewards");
  let eventTimer = 0;

  return {
    onStart(handler: () => void) {
      startButton.addEventListener("click", handler);
    },

    onRetry(handler: () => void) {
      retryButton.addEventListener("click", handler);
    },

    renderProfile(profile: PlayerProfile) {
      profileStrip.innerHTML = [
        stat("Coins", profile.coins),
        stat("Runs", profile.totalRuns),
        stat("Artefacts", profile.artefacts.length)
      ].join("");
    },

    showHud() {
      menu.classList.remove("screen-visible");
      result.classList.remove("screen-visible");
      hud.classList.add("hud-visible");
    },

    renderHud(snapshot: RunStateSnapshot) {
      destination.textContent = snapshot.destination;
      distance.textContent = `${Math.floor((snapshot.distance / snapshot.distanceGoal) * 100)}%`;
      coins.textContent = `${snapshot.coins} coins`;
      fuel.textContent = `Fuel ${snapshot.fuel}`;
      health.textContent = `Hull ${snapshot.hull}`;
      hud.dataset.cursed = String(snapshot.cursed);
    },

    flashEvent(message: string) {
      window.clearTimeout(eventTimer);
      eventText.textContent = message;
      eventText.classList.add("hud-event-visible");
      eventTimer = window.setTimeout(() => {
        eventText.classList.remove("hud-event-visible");
      }, 1600);
    },

    showResult(runResult: RunResult) {
      hud.classList.remove("hud-visible");
      result.classList.add("screen-visible");
      resultMark.textContent = runResult.status === "arrived" ? "Arrived" : "Limped Home";
      resultTitle.textContent = runResult.status === "arrived" ? "Destination Reached" : "Ship Still Technically Exists";
      resultCopy.textContent = runResult.message;
      resultRewards.innerHTML = [
        reward("Coins", `+${runResult.coins}`),
        reward("Distance", `${Math.floor((runResult.distance / 1200) * 100)}%`),
        reward("Finds", runResult.artefacts.length || (runResult.consolation ? "Pity sticker" : "None"))
      ].join("");
    }
  };
}

function stat(label: string, value: string | number) {
  return `<div class="profile-stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function reward(label: string, value: string | number) {
  return `<div class="reward-stat"><span>${label}</span><strong>${value}</strong></div>`;
}
