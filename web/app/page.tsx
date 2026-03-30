"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { useState, useRef, useCallback } from "react";

const DEFAULT_TOKENS = JSON.stringify(
  {
    "cds-stroke-hard": { light: "#003872", dark: "#7EB6FF" },
    "cds-fill-interactive-hard": { light: "#d52c2c", dark: "#FF6B6B" },
  },
  null,
  2
);

interface ConvertResult {
  light: string;
  dark: string;
  themed: string;
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

function downloadBase64(base64: string, filename: string) {
  const blob = new Blob([new Uint8Array(base64ToArrayBuffer(base64))], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Theme = "light" | "dark";

function ThemedLottiePreview({ data }: { data: ArrayBuffer }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  const handleRef = useCallback(
    (instance: DotLottie | null) => {
      setDotLottie(instance);
      if (instance) {
        if (theme === "dark") {
          instance.setTheme("Dark");
        } else {
          instance.resetTheme();
        }
      }
    },
    [theme]
  );

  const handleThemeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newTheme = e.target.value as Theme;
      setTheme(newTheme);
      if (dotLottie) {
        if (newTheme === "dark") {
          dotLottie.setTheme("Dark");
        } else {
          dotLottie.resetTheme();
        }
      }
    },
    [dotLottie]
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm font-medium">Themed (single .lottie with slots)</p>
      <select
        value={theme}
        onChange={handleThemeChange}
        className="px-3 py-1.5 border rounded-lg text-sm bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <div
        className={`w-full aspect-square rounded-lg border overflow-hidden ${
          theme === "dark"
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-300"
        }`}
      >
        <DotLottieReact
          data={data}
          autoplay
          loop
          themeId={theme === "dark" ? "Dark" : ""}
          dotLottieRefCallback={handleRef}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [tokensText, setTokensText] = useState(DEFAULT_TOKENS);
  const [lottieJson, setLottieJson] = useState<any>(null);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setLottieJson(json);
        setError("");
      } catch {
        setError("Invalid JSON file");
        setLottieJson(null);
      }
    };
    reader.readAsText(file);
  }

  async function handleConvert() {
    setError("");
    setResult(null);

    let tokens;
    try {
      tokens = JSON.parse(tokensText);
    } catch {
      setError("Invalid tokens JSON");
      return;
    }

    if (!lottieJson) {
      setError("Please upload a Lottie JSON file first");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/convert", {
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
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const baseName = fileName.replace(/\.json$/i, "") || "animation";

  return (
    <main className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Lottie Theme Playground</h1>
      <p className="text-sm text-gray-500 mb-8">
        Upload a light-mode Lottie JSON and theme tokens to generate light,
        dark, and themed .lottie files.
      </p>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Tokens editor */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Theme Tokens JSON
          </label>
          <textarea
            className="w-full h-64 p-3 border rounded-lg font-mono text-sm bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            value={tokensText}
            onChange={(e) => setTokensText(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-gray-400 mt-1">
            Format: {"{"} &quot;token-name&quot;: {"{"} &quot;light&quot;:
            &quot;#hex&quot;, &quot;dark&quot;: &quot;#hex&quot; {"}"} {"}"}
          </p>
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Light Lottie JSON
          </label>
          <div
            className="h-64 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors border-gray-300 dark:border-gray-700"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            {fileName ? (
              <div className="text-center">
                <p className="text-lg mb-1">{fileName}</p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  Loaded successfully
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Click to change file
                </p>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <svg
                  className="w-12 h-12 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm">Click to upload Lottie JSON</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convert button */}
      <button
        onClick={handleConvert}
        disabled={loading}
        className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
      >
        {loading ? "Converting..." : "Convert"}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-8">
          {/* Preview players */}
          <h2 className="text-xl font-semibold mb-4">Preview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Light */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium">Light</p>
              <div className="w-full aspect-square rounded-lg border overflow-hidden bg-white border-gray-300">
                <DotLottieReact
                  data={base64ToArrayBuffer(result.light)}
                  autoplay
                  loop
                />
              </div>
            </div>

            {/* Dark */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium">Dark (file swap)</p>
              <div className="w-full aspect-square rounded-lg border overflow-hidden bg-gray-900 border-gray-700">
                <DotLottieReact
                  data={base64ToArrayBuffer(result.dark)}
                  autoplay
                  loop
                />
              </div>
            </div>

            {/* Themed with its own dropdown */}
            <ThemedLottiePreview
              data={base64ToArrayBuffer(result.themed)}
            />
          </div>

          {/* Downloads */}
          <h2 className="text-xl font-semibold mb-4">Downloads</h2>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <button
              onClick={() =>
                downloadBase64(result.light, `${baseName}-light.lottie`)
              }
              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-gray-200 dark:border-gray-700"
            >
              <p className="font-medium">light.lottie</p>
              <p className="text-sm text-gray-500">
                Original light-mode animation
              </p>
            </button>
            <button
              onClick={() =>
                downloadBase64(result.dark, `${baseName}-dark.lottie`)
              }
              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-gray-200 dark:border-gray-700"
            >
              <p className="font-medium">dark.lottie</p>
              <p className="text-sm text-gray-500">
                Color-swapped dark-mode animation
              </p>
            </button>
            <button
              onClick={() =>
                downloadBase64(result.themed, `${baseName}-themed.lottie`)
              }
              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-gray-200 dark:border-gray-700"
            >
              <p className="font-medium">themed.lottie</p>
              <p className="text-sm text-gray-500">
                Slotted with light + dark theme
              </p>
            </button>
          </div>

          {/* Logs */}
          <details className="mb-8">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Conversion logs ({result.logs.length})
            </summary>
            <pre className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700">
              {result.logs.join("\n")}
            </pre>
          </details>
        </div>
      )}
    </main>
  );
}
