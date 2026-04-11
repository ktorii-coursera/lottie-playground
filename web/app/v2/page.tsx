"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";

const DEFAULT_TOKENS = JSON.stringify(
  {
    "mat-hard-lit-primary-side-face": { light: "#E7D9FF", dark: "#F5EFFF" },
    "mat-hard-lit-primary-side-soft-shadow": { light: "#A678F5", dark: "#D1B6FF" },
    "mat-hard-lit-primary-side-hard-shadow": { light: "#ADCFFF", dark: "#CFE3FF" },
    "side-face-disabled-strong": { light: "#7E7E7E", dark: "#A3A3A3" },
    "side-soft-shadow-disabled-strong": { light: "#5F5F5F", dark: "#868686" },
    "side-hard-shadow-disabled-strong": { light: "#434343", dark: "#9F9F9F" },
    "page-bg": { light: "#F5F5F5", dark: "#2B2B2B" },
    "shadow-pink": { light: "#FF82E7", dark: "#FF82E7" },
    "shadow-cast": { light: "#000000", dark: "#000000" },
    "light-orange-1": { light: "#F20000", dark: "#FFA3A3", alpha: 0 },
    "light-orange-2": { light: "#F28100", dark: "#F9C992" },
  },
  null,
  2
);

interface ConvertResult {
  original: string;
  themed: string;
  themedJson: any;
  lightRules: any[];
  darkRules: any[];
  logs: string[];
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

type Theme = "light" | "dark";

export default function V2Page() {
  const [tokensText, setTokensText] = useState(DEFAULT_TOKENS);
  const [lottieText, setLottieText] = useState("");
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "converting" | "done">("idle");
  const [themedTheme, setThemedTheme] = useState<Theme>("dark");
  const [pauseLabel, setPauseLabel] = useState("Pause");
  const pausedRef = useRef(false);
  const [frameInput, setFrameInput] = useState("0");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs to both dotLottie instances
  const originalRef = useRef<DotLottie | null>(null);
  const themedRef = useRef<DotLottie | null>(null);

  const handleOriginalRef = useCallback((instance: DotLottie | null) => {
    if (instance) originalRef.current = instance;
  }, []);

  const handleThemedRef = useCallback((instance: DotLottie | null) => {
    if (instance) {
      themedRef.current = instance;
      instance.addEventListener("load", () => {
        instance.setTheme(themedTheme === "dark" ? "Dark" : "Light");
      });
    }
  }, [themedTheme]);

  // Apply theme on themed player
  useEffect(() => {
    const dl = themedRef.current;
    if (!dl) return;
    dl.setTheme(themedTheme === "dark" ? "Dark" : "Light");
  }, [themedTheme]);

  // --- Shared controls (operate both players) ---
  function both(fn: (dl: DotLottie) => void) {
    if (originalRef.current) fn(originalRef.current);
    if (themedRef.current) fn(themedRef.current);
  }

  function handleRestart() { both(dl => { dl.stop(); dl.play(); }); pausedRef.current = false; setPauseLabel("Pause"); }
  function handlePause() {
    if (pausedRef.current) { both(dl => dl.play()); pausedRef.current = false; setPauseLabel("Pause"); }
    else { both(dl => dl.pause()); pausedRef.current = true; setPauseLabel("Play"); }
  }
  function handleGoToFrame() {
    const frame = parseFloat(frameInput);
    if (!isNaN(frame)) both(dl => dl.setFrame(frame));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setLottieText(event.target?.result as string);
      setError("");
    };
    reader.readAsText(file);
  }

  async function handleConvert() {
    setError("");
    setResult(null);
    setStatus("converting");

    let tokens;
    try { tokens = JSON.parse(tokensText); }
    catch { setError("Invalid tokens JSON"); setStatus("idle"); return; }

    let lottieJson;
    try { lottieJson = JSON.parse(lottieText); }
    catch { setError("Invalid Lottie JSON"); setStatus("idle"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/convert-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lottieJson, tokens }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Conversion failed");
      }
      const data: ConvertResult = await res.json();
      setResult(data);
      setStatus("done");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStatus("idle");
    } finally {
      setLoading(false);
    }
  }

  // Memoize ArrayBuffers so DotLottieReact doesn't remount on every render
  const originalData = useMemo(() => result ? base64ToArrayBuffer(result.original) : null, [result?.original]);
  const themedData = useMemo(() => result ? base64ToArrayBuffer(result.themed) : null, [result?.themed]);

  const btnClass = "px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-gray-300 dark:border-gray-700";

  return (
    <main className="min-h-screen p-6 md:p-12 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Intent-Token Converter v2</h1>
      <p className="text-sm text-gray-500 mb-8">
        Layer names match design tokens in global.json. Supports animated color
        transitions between multiple tokens.
      </p>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Tokens JSON (global.json)</label>
          <textarea
            data-testid="tokens-input"
            className="w-full h-64 p-3 border rounded-lg font-mono text-xs bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            value={tokensText}
            onChange={(e) => setTokensText(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium">Lottie JSON</span>
          </div>
          <input type="file" accept=".json" onChange={handleFileUpload} className="mb-2 text-sm" />
          <textarea
            data-testid="lottie-input"
            className="w-full h-64 p-3 border rounded-lg font-mono text-xs bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            value={lottieText}
            onChange={(e) => setLottieText(e.target.value)}
            placeholder="Paste Lottie JSON here..."
            spellCheck={false}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <button data-testid="convert-btn" onClick={handleConvert} disabled={loading}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors">
          {loading ? "Converting..." : "Convert"}
        </button>
        <span data-testid="convert-status" className="text-sm text-gray-500">
          {status === "converting" ? "Converting..." : status === "done" ? "Done" : ""}
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Preview</h2>

          {/* Players side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
            {/* Original */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium">Original</p>
              <div data-testid="player-original" className="w-full aspect-square rounded-lg border overflow-hidden bg-white border-gray-300">
                <DotLottieReact data={originalData!} autoplay loop dotLottieRefCallback={handleOriginalRef} />
              </div>
            </div>

            {/* Themed */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium">Themed</p>
                <select
                  data-testid="theme-toggle"
                  value={themedTheme}
                  onChange={(e) => setThemedTheme(e.target.value as Theme)}
                  className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div data-testid="player-themed"
                className={`w-full aspect-square rounded-lg border overflow-hidden ${themedTheme === "dark" ? "bg-[#111111] border-gray-800" : "bg-white border-gray-300"}`}>
                <DotLottieReact data={themedData!} autoplay loop dotLottieRefCallback={handleThemedRef} />
              </div>
            </div>
          </div>

          {/* Shared controls */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <button data-testid="restart" onClick={handleRestart} className={btnClass}>Restart</button>
            <button data-testid="pause" onClick={handlePause} className={btnClass}>{pauseLabel}</button>
          </div>
          <div className="flex items-center justify-center gap-2">
            <input
              data-testid="frame-input"
              type="number"
              value={frameInput}
              onChange={(e) => setFrameInput(e.target.value)}
              className="w-20 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-center"
              placeholder="Frame"
            />
            <button data-testid="goto-frame" onClick={handleGoToFrame} className={btnClass}>Go to frame</button>
          </div>
        </div>
      )}

      {/* Downloads */}
      {result && (
        <div className="mb-6 flex gap-4">
          <button onClick={() => {
            const blob = new Blob([new Uint8Array(base64ToArrayBuffer(result.themed))], { type: "application/octet-stream" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "themed.lottie"; a.click();
          }} className={btnClass}>Download .lottie</button>
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(result.themedJson, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "themed.json"; a.click();
          }} className={btnClass}>Download themed JSON</button>
        </div>
      )}

      {/* Inspectors */}
      {result && (
        <details className="mb-6">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300">
            Dark Theme Rules ({result.darkRules.length} rules)
          </summary>
          <pre className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700">
            {JSON.stringify(result.darkRules, null, 2)}
          </pre>
        </details>
      )}
      {result && result.themedJson?.slots && (
        <details className="mb-6">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300">
            Slots ({Object.keys(result.themedJson.slots).length} slots)
          </summary>
          <pre className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700">
            {JSON.stringify(result.themedJson.slots, null, 2)}
          </pre>
        </details>
      )}
      {result && (
        <details className="mb-8">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            Conversion logs ({result.logs.length})
          </summary>
          <pre className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700">
            {result.logs.join("\n")}
          </pre>
        </details>
      )}
    </main>
  );
}
