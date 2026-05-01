"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import globalTokens from "../global.json";

const { meta, tokens: tokenData } = globalTokens as { meta?: { updatedAt?: string }; tokens: Record<string, any> };
const DEFAULT_TOKENS = JSON.stringify(tokenData, null, 2);

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

interface LayerColorMatch {
  property: string;
  hex: string;
  tokens: string[];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
}

function colorsMatch(lottieRgb: number[], targetHex: string): boolean {
  const hex = targetHex.toLowerCase();
  const tr = parseInt(hex.slice(1, 3), 16) / 255;
  const tg = parseInt(hex.slice(3, 5), 16) / 255;
  const tb = parseInt(hex.slice(5, 7), 16) / 255;
  return (
    Math.abs(Math.round(lottieRgb[0] * 255) - Math.round(tr * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[1] * 255) - Math.round(tg * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[2] * 255) - Math.round(tb * 255)) <= 1
  );
}

function reverseTokenLookup(
  lottieJson: any,
  tokens: Record<string, { light: string; dark: string }>
): Record<string, LayerColorMatch[]> {
  const hexToTokens = new Map<string, string[]>();
  for (const [name, { light }] of Object.entries(tokens)) {
    const h = light.toLowerCase();
    if (!hexToTokens.has(h)) hexToTokens.set(h, []);
    hexToTokens.get(h)!.push(name);
  }

  const result: Record<string, LayerColorMatch[]> = {};

  function findTokensForColor(rgb: number[]): { hex: string; tokens: string[] } | null {
    if (!Array.isArray(rgb) || rgb.length < 3 || typeof rgb[0] !== "number") return null;
    const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
    const matched: string[] = [];
    for (const [lightHex, names] of hexToTokens) {
      if (colorsMatch(rgb, lightHex)) matched.push(...names);
    }
    return matched.length > 0 ? { hex, tokens: matched } : null;
  }

  function extractColorsFromShapes(shapes: any[], layerName: string) {
    if (!Array.isArray(shapes)) return;
    for (const shape of shapes) {
      if (shape.ty === "gr" && Array.isArray(shape.it)) {
        extractColorsFromShapes(shape.it, layerName);
        continue;
      }
      if ((shape.ty === "fl" || shape.ty === "st") && shape.c) {
        const colorObj = shape.c;
        const propLabel = shape.ty === "fl" ? "fill" : "stroke";
        if (colorObj.a === 0 && Array.isArray(colorObj.k)) {
          const match = findTokensForColor(colorObj.k);
          if (match) {
            if (!result[layerName]) result[layerName] = [];
            result[layerName].push({ property: propLabel, ...match });
          }
        } else if (colorObj.a === 1 && Array.isArray(colorObj.k)) {
          for (const kf of colorObj.k) {
            if (kf.s) {
              const match = findTokensForColor(kf.s);
              if (match) {
                if (!result[layerName]) result[layerName] = [];
                result[layerName].push({ property: `${propLabel} (keyframe)`, ...match });
              }
            }
          }
        }
      }
      if ((shape.ty === "gf" || shape.ty === "gs") && shape.g?.k) {
        const propLabel = shape.ty === "gf" ? "gradient-fill" : "gradient-stroke";
        const gData = shape.g.k;
        const numStops = shape.g.p;
        const processStops = (k: number[]) => {
          if (!Array.isArray(k)) return;
          for (let i = 0; i < numStops; i++) {
            const base = i * 4;
            if (base + 3 >= k.length) break;
            const match = findTokensForColor([k[base + 1], k[base + 2], k[base + 3]]);
            if (match) {
              if (!result[layerName]) result[layerName] = [];
              result[layerName].push({ property: `${propLabel} stop ${i}`, ...match });
            }
          }
        };
        if (gData.a === 0) processStops(gData.k);
        else if (gData.a === 1 && Array.isArray(gData.k)) {
          for (const kf of gData.k) {
            if (kf.s) processStops(kf.s);
          }
        }
      }
    }
  }

  function walkLayers(layers: any[], parentPath: string = "") {
    if (!Array.isArray(layers)) return;
    for (const layer of layers) {
      const name = parentPath ? `${parentPath} / ${layer.nm || "unnamed"}` : (layer.nm || "unnamed");
      if (Array.isArray(layer.shapes)) {
        extractColorsFromShapes(layer.shapes, name);
      }
      if (Array.isArray(layer.layers)) {
        walkLayers(layer.layers, name);
      }
    }
  }

  walkLayers(lottieJson.layers);
  if (Array.isArray(lottieJson.assets)) {
    for (const asset of lottieJson.assets) {
      if (Array.isArray(asset.layers)) {
        walkLayers(asset.layers, asset.nm || asset.id || "asset");
      }
    }
  }

  return result;
}

function PasswordGate({ children }: { children: React.ReactNode }) {
  const [input, setInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem("lottie-auth");
    if (saved === "1") setAuthed(true);
    setChecking(false);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: input }),
    });
    if (res.ok) {
      sessionStorage.setItem("lottie-auth", "1");
      setAuthed(true);
    } else {
      setInput("");
    }
  }

  if (checking) return null;

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
          <h1 className="text-xl font-semibold">Lottie Theme Playground</h1>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Password"
            autoFocus
            className="px-4 py-2 border rounded-lg text-center w-64 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
            Enter
          </button>
        </form>
      </main>
    );
  }

  return <>{children}</>;
}

export default function HomePage() {
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
  const [tokenLookupResult, setTokenLookupResult] = useState<Record<string, LayerColorMatch[]> | null>(null);
  const [tokenLookupError, setTokenLookupError] = useState("");

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

  useEffect(() => {
    const dl = themedRef.current;
    if (!dl) return;
    dl.setTheme(themedTheme === "dark" ? "Dark" : "Light");
  }, [themedTheme]);

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

  function handleTokenLookup() {
    setTokenLookupError("");
    setTokenLookupResult(null);

    let tokens;
    try { tokens = JSON.parse(tokensText); }
    catch { setTokenLookupError("Invalid tokens JSON"); return; }

    let lottieJson;
    try { lottieJson = JSON.parse(lottieText); }
    catch { setTokenLookupError("Paste or upload a Lottie JSON first"); return; }

    const result = reverseTokenLookup(lottieJson, tokens);
    if (Object.keys(result).length === 0) {
      setTokenLookupError("No matching tokens found for any layer colors");
      return;
    }
    setTokenLookupResult(result);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const originalData = useMemo(() => result ? base64ToArrayBuffer(result.original) : null, [result?.original]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const themedData = useMemo(() => result ? base64ToArrayBuffer(result.themed) : null, [result?.themed]);

  const btnClass = "px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-gray-300 dark:border-gray-700";

  return (
    <PasswordGate>
      <main className="min-h-screen p-6 md:p-12 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Lottie Theme Playground</h1>
        <p className="text-sm text-gray-500 mb-2">
          Upload a Lottie JSON and convert it with illustration intent tokens for light/dark theming.
        </p>
        {meta?.updatedAt && (
          <p className="text-xs text-gray-400 mb-8">
            Tokens last updated: {new Date(meta.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm font-medium">Original</p>
                <div data-testid="player-original" className="w-full aspect-square rounded-lg border overflow-hidden bg-white border-gray-300">
                  <DotLottieReact data={originalData!} autoplay loop dotLottieRefCallback={handleOriginalRef} />
                </div>
              </div>

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
        <hr className="my-10 border-gray-200 dark:border-gray-700" />

        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-2">Token Name Lookup</h2>
          <p className="text-sm text-gray-500 mb-4">
            Reverse lookup from Lottie layer colors to intent token names. Insert the desired token name in the square brackets for each layer name in After Effects, then export using Bodymovin and use this playground to view the dark mode colors.
          </p>
          <button onClick={handleTokenLookup}
            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-900 dark:bg-gray-200 dark:hover:bg-gray-300 text-white dark:text-black font-medium rounded-lg transition-colors mb-4">
            Get Token Names
          </button>
          {tokenLookupError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {tokenLookupError}
            </div>
          )}
          {tokenLookupResult && (
            <pre className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs overflow-x-auto max-h-[32rem] overflow-y-auto border border-gray-200 dark:border-gray-700 font-mono">
              {JSON.stringify(tokenLookupResult, null, 2)}
            </pre>
          )}
        </div>
      </main>
    </PasswordGate>
  );
}
