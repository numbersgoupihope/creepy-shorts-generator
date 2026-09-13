// Visual regression check for the effects pipeline.
//
// This exists because v2 shipped with the video pipeline silently doing
// nothing visually (only the audio layer was actually wired up) — canvas
// screenshots looked fine at a glance (grain overlay was animating) but
// the underlying footage itself never advanced. Catch that class of bug
// automatically instead of relying on someone noticing by eye.
//
// An earlier version of this script inferred phase (mundane vs. frozen
// vs. cut) purely from wall-clock polling intervals. That was flaky in
// two different ways as the pipeline evolved: first the freeze window's
// position shifted with randomized params and picked clip, then even
// after fixing that, sampling via canvas.toDataURL()/getImageData in a
// tight loop turned out to be expensive enough to perturb the polling
// script's own timing relative to the page's real elapsed time — poll
// counts stopped reliably corresponding to wall-clock time, so a ~1-2s
// freeze window could be sampled zero times even though (confirmed via
// direct in-app logging) it fired exactly on schedule.
//
// Instead of inferring phase from timing at all, VideoStage.tsx sets
// canvas.dataset.phase to "mundane" / "freeze" / "cut" as those phases
// actually begin (a plain DOM attribute write, not React state, so it's
// nearly free). This script polls that cheap flag to know WHEN to
// sample, then takes pixel samples only at that moment — sampling is
// driven by the pipeline's own ground truth, not a guess.
//
// Run: npm run test:visual (starts its own dev server on an ephemeral
// port, so nothing else needs to be running first)

import { chromium } from "playwright";
import { spawn } from "node:child_process";

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

async function getPhase(page) {
  return page.evaluate(() => document.querySelector("canvas")?.dataset.phase ?? null);
}

async function waitForPhase(page, phase, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await getPhase(page)) === phase) return true;
    await page.waitForTimeout(30);
  }
  return false;
}

async function fingerprint(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const GRID = 24;
    let fp = "";
    let isBlack = true;
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const x = Math.min(w - 1, Math.floor(((gx + 0.5) * w) / GRID));
        const y = Math.min(h - 1, Math.floor(((gy + 0.5) * h) / GRID));
        const d = ctx.getImageData(x, y, 1, 1).data;
        if (d[0] > 8 || d[1] > 8 || d[2] > 8) isBlack = false;
        fp += d[0] + "," + d[1] + "," + d[2] + ";";
      }
    }
    return { fp, isBlack };
  });
}

async function main() {
  const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: ["ignore", "pipe", "inherit"],
    detached: true, // own process group, so its esbuild child dies too
  });

  const failures = [];
  try {
    await waitForServer(server);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(BASE_URL);
    await page.waitForSelector('button:has-text("Generate clip")');

    // Short duration keeps this check fast.
    await page.click('button:has-text("short")');
    await page.click('button:has-text("Generate clip")');

    const gotMundane = await waitForPhase(page, "mundane", 3000);
    if (!gotMundane) {
      failures.push("playback never reached the mundane phase — Generate may not have started anything.");
    } else {
      const a = await fingerprint(page);
      await page.waitForTimeout(280);
      // Bail out of the motion check early if we've already rolled into
      // freeze — a very short "short" pick could do that.
      const stillMundane = (await getPhase(page)) === "mundane";
      const b = await fingerprint(page);
      if (stillMundane && a.fp === b.fp) {
        failures.push("canvas content never changed during normal playback — the video isn't actually being decoded/drawn.");
      } else {
        console.log("PASS: canvas content changes during normal playback (video is actually rendering).");
      }
    }

    const gotFreeze = await waitForPhase(page, "freeze", 12_000);
    if (!gotFreeze) {
      failures.push("playback never reached the freeze phase within 12s — the held freeze-frame step may not be firing.");
    } else {
      const a = await fingerprint(page);
      await page.waitForTimeout(150);
      const stillFrozen = (await getPhase(page)) === "freeze";
      const b = await fingerprint(page);
      if (!stillFrozen) {
        failures.push("the freeze phase ended in well under 150ms — too brief to be the intended held freeze-frame.");
      } else if (a.isBlack || b.isBlack) {
        failures.push("the canvas read as solid black during what should be the freeze phase, before the actual cut.");
      } else if (a.fp !== b.fp) {
        failures.push("the held freeze-frame isn't actually pausing rendering (content changed 150ms apart while frozen).");
      } else {
        console.log("PASS: canvas is static while the freeze phase holds.");
      }
    }

    const gotCut = await waitForPhase(page, "cut", 8000);
    if (!gotCut) {
      failures.push("playback never reached the cut phase — the hard cut to black may not be firing.");
    } else {
      const { isBlack } = await fingerprint(page);
      if (!isBlack) {
        failures.push("canvas.dataset.phase reports 'cut' but the canvas isn't actually solid black.");
      } else {
        console.log("PASS: canvas is solid black once the cut fires.");
      }
    }

    await browser.close();
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill();
    }
  }

  if (failures.length) {
    console.error("\nVisual regression check FAILED:");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log("\nVisual regression check passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
