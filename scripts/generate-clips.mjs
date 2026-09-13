// FALLBACK GENERATOR — not currently used. public/clips/ is now populated
// with real trimmed footage (hallway.mp4, room-corner.mp4, corridor.mp4,
// garage-corridor.mp4), not these placeholders.
//
// This script draws plain, ordinary procedural scenes (a hallway, a room
// corner, a light fixture, a window) to a <canvas> in a real browser and
// captures them with MediaRecorder, writing scene-name.webm files. Keep
// it around for whoever needs stand-in clips when no real footage is
// available yet — it writes different filenames/extensions than the
// real clips above, so running it won't overwrite them, but src/App.tsx's
// CLIPS list would need updating to actually use its output.
//
// Run: node scripts/generate-clips.mjs

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "clips");
mkdirSync(OUT_DIR, { recursive: true });

const SCENES = ["hallway", "room-corner", "light-fixture", "window"];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");

  for (const scene of SCENES) {
    console.log("rendering", scene);
    const dataUrl = await page.evaluate(renderScene, scene);
    const base64 = dataUrl.split(",")[1];
    writeFileSync(join(OUT_DIR, `${scene}.webm`), Buffer.from(base64, "base64"));
  }

  await browser.close();
  console.log("done");
}

// Runs inside the page — draws one scene to canvas for a few seconds and
// records it (video + a very quiet room-tone hum) to a webm data URL.
async function renderScene(scene) {
  const W = 640,
    H = 360;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 90;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.02;
  osc.connect(gain);
  gain.connect(dest);
  osc.start();

  const canvasStream = canvas.captureStream(30);
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(combined, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 2_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  const DURATION_MS = 4500;
  const start = performance.now();

  function drawHallway(t) {
    ctx.fillStyle = "#15130f";
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2 + Math.sin(t * 0.15) * 4;
    const cy = H / 2;
    for (let i = 6; i >= 1; i--) {
      const s = i / 6;
      const w = W * 0.9 * s;
      const h = H * 0.75 * s;
      ctx.strokeStyle = `rgba(200,190,170,${0.15 + 0.05 * (6 - i)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    }
    const flicker = 0.85 + Math.sin(t * 2.1) * 0.05 + Math.sin(t * 5.3) * 0.02;
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60);
    glow.addColorStop(0, `rgba(255,235,190,${0.8 * flicker})`);
    glow.addColorStop(1, "rgba(255,235,190,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRoomCorner(t) {
    ctx.fillStyle = "#1c2129";
    ctx.fillRect(0, 0, W, H);
    const cornerX = W * 0.42 + Math.sin(t * 0.1) * 2;
    const leftGrad = ctx.createLinearGradient(0, 0, cornerX, 0);
    leftGrad.addColorStop(0, "#232a35");
    leftGrad.addColorStop(1, "#171c24");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, cornerX, H);
    const rightGrad = ctx.createLinearGradient(cornerX, 0, W, 0);
    rightGrad.addColorStop(0, "#12161c");
    rightGrad.addColorStop(1, "#1a2029");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(cornerX, 0, W - cornerX, H);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cornerX, 0);
    ctx.lineTo(cornerX, H);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, H - 24, W, 24);
    const breathe = 0.9 + Math.sin(t * 0.6) * 0.06;
    ctx.fillStyle = `rgba(255,255,255,${0.03 * breathe})`;
    ctx.fillRect(0, 0, W, H * 0.4);
  }

  function drawLightFixture(t) {
    ctx.fillStyle = "#0f1113";
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.45;
    const flicker = 0.88 + Math.sin(t * 3.2) * 0.06 + Math.sin(t * 7.1) * 0.03;
    ctx.strokeStyle = "rgba(210,210,210,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.stroke();
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 130);
    glow.addColorStop(0, `rgba(255,250,225,${0.95 * flicker})`);
    glow.addColorStop(0.5, `rgba(255,244,210,${0.35 * flicker})`);
    glow.addColorStop(1, "rgba(255,244,210,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#e8dcc0";
    ctx.beginPath();
    ctx.arc(cx, cy, 55, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWindow(t) {
    ctx.fillStyle = "#0d1013";
    ctx.fillRect(0, 0, W, H);
    const fx = W * 0.2,
      fy = H * 0.15,
      fw = W * 0.6,
      fh = H * 0.7;
    const hazeShift = Math.sin(t * 0.2) * 3;
    const sky = ctx.createLinearGradient(0, fy, 0, fy + fh);
    sky.addColorStop(0, "#3a4550");
    sky.addColorStop(1, "#232b33");
    ctx.fillStyle = sky;
    ctx.fillRect(fx + hazeShift, fy, fw, fh);
    ctx.strokeStyle = "#4a3a28";
    ctx.lineWidth = 10;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(fx + fw / 2, fy);
    ctx.lineTo(fx + fw / 2, fy + fh);
    ctx.moveTo(fx, fy + fh / 2);
    ctx.lineTo(fx + fw, fy + fh / 2);
    ctx.stroke();
    const sway = Math.sin(t * 0.8) * 6;
    ctx.fillStyle = "rgba(60,50,45,0.5)";
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx + 14 + sway, fy + fh / 2, fx, fy + fh);
    ctx.lineTo(fx, fy);
    ctx.fill();
  }

  const drawers = {
    hallway: drawHallway,
    "room-corner": drawRoomCorner,
    "light-fixture": drawLightFixture,
    window: drawWindow,
  };
  const draw = drawers[scene];

  function frame() {
    const t = (performance.now() - start) / 1000;
    draw(t);
    if (performance.now() - start < DURATION_MS) {
      requestAnimationFrame(frame);
    } else {
      recorder.stop();
      osc.stop();
    }
  }
  recorder.start();
  requestAnimationFrame(frame);
  await stopped;

  const blob = new Blob(chunks, { type: "video/webm" });
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

main();
