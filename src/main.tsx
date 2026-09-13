import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getAudioEngine } from "@/lib/audio";
import "./index.css";

// TEMP (v4 diagnostic pass) — lets an external capture script reach the
// audio engine to tap real output for an audio+video evidence recording.
// Remove once done.
(window as unknown as { __debugAudioEngine: ReturnType<typeof getAudioEngine> }).__debugAudioEngine = getAudioEngine();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
