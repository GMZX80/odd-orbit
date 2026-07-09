import { chromium } from "playwright";

const url = process.env.ODD_ORBIT_URL ?? "http://127.0.0.1:4173/odd-orbit/?testHooks=1&travel=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 720 }, deviceScaleFactor: 2 });

try {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__ODD_ORBIT_TEST__), undefined, { timeout: 8000 });
  await page.waitForFunction(() => window.__ODD_ORBIT_TEST__?.getState().scene === "travel", undefined, { timeout: 8000 });
  await page.waitForSelector("canvas", { state: "visible", timeout: 8000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const hud = document.querySelector("#hud.hud-visible");
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0 && hud);
  });

  const state = await page.evaluate(() => window.__ODD_ORBIT_TEST__?.getState());
  if (!state?.run || state.run.units < 1 || state.run.distanceGoal <= 0) {
    throw new Error(`Travel run state did not initialise: ${JSON.stringify(state)}`);
  }

  const screenshot = await page.screenshot();
  const nonZeroBytes = screenshot.filter((byte) => byte !== 0).length;
  if (nonZeroBytes < screenshot.length * 0.12) {
    throw new Error("Smoke screenshot looked unexpectedly empty");
  }

  const seriousErrors = consoleErrors.filter((text) => !text.includes("Failed to load resource"));
  if (seriousErrors.length > 0) {
    throw new Error(`Console errors during smoke test:\n${seriousErrors.join("\n")}`);
  }

  console.log(`Odd Orbit smoke passed at ${url}`);
} finally {
  await browser.close();
}
