import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { convertFigmaTokens } from "./lib/figma-token-converter.js";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.global || !args.light || !args.dark) {
  console.error(
    "Usage: npx tsx convert-figma-tokens.ts --global <global-colors.json> --light <light-intents.json> --dark <dark-intents.json> [--output <out.json>]"
  );
  console.error("");
  console.error("  --global  Figma global colors export (Mode 1.tokens.json)");
  console.error("  --light   Figma intent colors light mode (Lightmode.tokens.json)");
  console.error("  --dark    Figma intent colors dark mode (Darkmode.tokens.json)");
  console.error("  --output  Output path (default: global.json)");
  process.exit(1);
}

const outputPath = args.output || "global.json";

const [globalColors, lightIntents, darkIntents] = await Promise.all([
  readFile(resolve(args.global), "utf-8").then(JSON.parse),
  readFile(resolve(args.light), "utf-8").then(JSON.parse),
  readFile(resolve(args.dark), "utf-8").then(JSON.parse),
]);

const { tokens, warnings } = convertFigmaTokens(
  globalColors,
  lightIntents,
  darkIntents
);

for (const w of warnings) {
  console.warn(w);
}

const json = JSON.stringify(tokens, null, 2) + "\n";
await writeFile(resolve(outputPath), json);
await writeFile(resolve("web", outputPath), json);

const count = Object.keys(tokens).length;
console.log(`Wrote ${count} tokens to ${outputPath} and web/${outputPath}`);
