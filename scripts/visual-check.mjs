// Visual regression check for the effects pipeline.
//
// This exists because v2 shipped with the video pipeline silently doing
// nothing visually (only the audio layer was actually wired up) — canvas
// screenshots looked fine at a glance (grain overlay was animating) but
// the underlying footage itself never advanced. Catch that class of bug
// automatically instead of relying on someone noticing by eye:
//
//   1. Two canvas captures ~100ms apart during normal playback MUST
//      differ — if they're identical, the video isn't actually decoding
//      onto the canvas (this is exactly how v2's bug would show up here).
//   2. Two canvas captures ~150ms apart during the freeze window MUST be
//      near-identical — if they differ, the "held freeze-frame" isn't
//      actually pausing rendering, just a step that was never wired up.
//
// Run: npm run test:visual  (starts its own dev server on an ephemeral
// port, so nothing else needs to be running first)

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 5183;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(proc) {
  await new Promise((resolve, reject) => {
    let out = "";
    const onData = (buf) => {
      out += buf.toString();
      if (out.includes("ready in")) {
        proc.stdout.off("data", onData);
        resolve();
      }
    };
    proc.stdout.on("data", onData);
    proc.on("exit", (code) => reject(new Error(`dev server exited early (code ${code})`)));
    setTimeout(() => reject(new Error("dev server did not start in time")), 20_000);
  });
}

async function snapshotCanvas(page) {
  return page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"));
}

async function main() {
  const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: ["ignore", "pipe", "inherit"],
    detached: true, // own process group, so its esbuild child dies too
  });

  let failed = false;
  try {
    await waitForServer(server);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(BASE_URL);
    await page.waitForSelector('button:has-text("Generate clip")');

    // Short duration keeps this check fast.
    await page.click('button:has-text("short")');
    await page.click('button:has-text("Generate clip")');

    // Mundane-phase check: playback should visibly advance.
    await page.waitForTimeout(700);
    const mundaneA = await snapshotCanvas(page);
    await page.waitForTimeout(250);
    const mundaneB = await snapshotCanvas(page);

    if (mundaneA === mundaneB) {
      failed = true;
      console.error("FAIL: canvas frames were identical 250ms apart during normal playback.");
      console.error("      The video is not actually being drawn/decoded onto the canvas.");
    } else {
      console.log("PASS: canvas content changes during normal playback (video is actually rendering).");
    }

    // Freeze-phase check: wait until just before the short clip's cut
    // (freeze holds for the final few hundred ms), then confirm two
    // captures in that window are static.
    await page.waitForTimeout(3900);
    const freezeA = await snapshotCanvas(page);
    await page.waitForTimeout(150);
    const freezeB = await snapshotCanvas(page);

    if (freezeA !== freezeB) {
      failed = true;
      console.error("FAIL: canvas content still changed 150ms apart in the freeze window before the cut.");
      console.error("      The held freeze-frame isn't actually pausing rendering.");
    } else {
      console.log("PASS: canvas is static during the held freeze-frame window.");
    }

    await browser.close();
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill();
    }
  }

  if (failed) {
    console.error("\nVisual regression check FAILED.");
    process.exit(1);
  }
  console.log("\nVisual regression check passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
