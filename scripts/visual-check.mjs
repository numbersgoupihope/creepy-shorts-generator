// Visual regression check for the effects pipeline.
//
// This exists because v2 shipped with the video pipeline silently doing
// nothing visually (only the audio layer was actually wired up) — canvas
// screenshots looked fine at a glance (grain overlay was animating) but
// the underlying footage itself never advanced. Catch that class of bug
// automatically instead of relying on someone noticing by eye.
//
// Rather than guessing fixed wait times for "mundane" vs "freeze" (the
// freeze window's exact position varies with the randomized freezeHoldMs
// and with which bundled clip got picked, which made an earlier version
// of this script flaky), it polls the canvas every ~90ms for the whole
// clip and empirically locates:
//   1. the cut to black (first frame that reads as solid black), then
//   2. the run of identical, non-black frames immediately before it —
//      that's the held freeze; it must be at least 2 samples long, or
//      the freeze isn't actually pausing rendering, just a step that was
//      never wired up.
//   3. at least one pair of consecutive DIFFERING frames somewhere
//      before that freeze run — if nothing ever changes, the video
//      isn't actually decoding onto the canvas (exactly how the v2 bug
//      showed up).
//
// Run: npm run test:visual  (starts its own dev server on an ephemeral
// port, so nothing else needs to be running first)

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 5183;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const POLL_MS = 90;
const MAX_POLLS = 90; // ~8.1s — comfortably past the "short" (5s) clip's cut

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

async function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const points = [
      [2, 2],
      [w - 2, 2],
      [2, h - 2],
      [w - 2, h - 2],
      [Math.floor(w / 2), Math.floor(h / 2)],
    ];
    let isBlack = true;
    for (const [x, y] of points) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      if (d[0] > 8 || d[1] > 8 || d[2] > 8) {
        isBlack = false;
        break;
      }
    }
    return { url: canvas.toDataURL("image/png"), isBlack };
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

    const samples = [];
    for (let i = 0; i < MAX_POLLS; i++) {
      await page.waitForTimeout(POLL_MS);
      samples.push(await snapshot(page));
      if (samples[i].isBlack && i > 0 && samples[i - 1].isBlack) break; // settled into the cut
    }

    const cutIdx = samples.findIndex((s) => s.isBlack);
    if (cutIdx === -1) {
      failures.push("the clip never cut to black within the polling window — playback may be stuck.");
    } else {
      let freezeRunLen = 1;
      for (let i = cutIdx - 1; i > 0; i--) {
        if (!samples[i].isBlack && samples[i].url === samples[i - 1].url) freezeRunLen++;
        else break;
      }
      if (freezeRunLen < 2) {
        failures.push(
          `the held freeze-frame isn't actually pausing rendering (only ${freezeRunLen} identical sample(s) found right before the cut to black).`,
        );
      } else {
        console.log(`PASS: canvas held a static freeze-frame for ${freezeRunLen} consecutive samples before the cut.`);
      }

      const mundaneEnd = Math.max(1, cutIdx - freezeRunLen);
      let sawMotion = false;
      for (let i = 1; i <= mundaneEnd; i++) {
        if (samples[i].url !== samples[i - 1].url) {
          sawMotion = true;
          break;
        }
      }
      if (!sawMotion) {
        failures.push("canvas content never changed during normal playback — the video isn't actually being decoded/drawn.");
      } else {
        console.log("PASS: canvas content changes during normal playback (video is actually rendering).");
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
