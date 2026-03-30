// Lottie Token Exporter - Figma plugin backend
// Runs in the Figma sandbox. Communicates with ui.html via postMessage.

figma.showUI(__html__, { width: 480, height: 600 });

// ---- Types ----

interface TokenEntry {
  light: string;
  dark: string;
}

type TokenLibrary = Record<string, TokenEntry>;

interface Mapping {
  layerPath: string;
  property: "fill" | "stroke";
  token: string;
  hex: string;
}

interface UnmatchedColor {
  layerPath: string;
  property: "fill" | "stroke";
  hex: string;
}

// ---- Helpers ----

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function buildLightLookup(
  tokens: TokenLibrary
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [name, entry] of Object.entries(tokens)) {
    map.set(entry.light.toLowerCase(), name);
  }
  return map;
}

function walkNode(
  node: SceneNode,
  parentPath: string,
  lookup: Map<string, string>,
  mappings: Mapping[],
  unmatched: UnmatchedColor[]
): void {
  const layerPath = parentPath ? `${parentPath}/${node.name}` : node.name;

  // Process fills
  if ("fills" in node && Array.isArray(node.fills)) {
    for (const paint of node.fills as ReadonlyArray<Paint>) {
      if (paint.type === "SOLID" && paint.visible !== false) {
        const hex = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
        const tokenName = lookup.get(hex.toLowerCase());
        if (tokenName) {
          mappings.push({ layerPath, property: "fill", token: tokenName, hex });
        } else {
          unmatched.push({ layerPath, property: "fill", hex });
        }
      }
    }
  }

  // Process strokes
  if ("strokes" in node && Array.isArray(node.strokes)) {
    for (const paint of node.strokes as ReadonlyArray<Paint>) {
      if (paint.type === "SOLID" && paint.visible !== false) {
        const hex = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
        const tokenName = lookup.get(hex.toLowerCase());
        if (tokenName) {
          mappings.push({ layerPath, property: "stroke", token: tokenName, hex });
        } else {
          unmatched.push({ layerPath, property: "stroke", hex });
        }
      }
    }
  }

  // Recurse into children
  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      walkNode(child as SceneNode, layerPath, lookup, mappings, unmatched);
    }
  }
}

// ---- Message handler ----

figma.ui.onmessage = async (msg: { type: string; tokens?: TokenLibrary }) => {
  if (msg.type === "export") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: "error", message: "Please select a frame or group first." });
      return;
    }

    const node = selection[0];
    const tokens = msg.tokens;
    if (!tokens || Object.keys(tokens).length === 0) {
      figma.ui.postMessage({ type: "error", message: "Token library is empty. Paste a valid JSON token map." });
      return;
    }

    const lookup = buildLightLookup(tokens);
    const mappings: Mapping[] = [];
    const unmatched: UnmatchedColor[] = [];

    walkNode(node, "", lookup, mappings, unmatched);

    // Export SVG
    try {
      const svgBytes = await node.exportAsync({ format: "SVG" });
      const svgString = String.fromCharCode(...svgBytes);

      // Build sidecar
      const sidecar = {
        version: "1.0" as const,
        source: "figma-plugin" as const,
        mappings,
      };

      figma.ui.postMessage({
        type: "export-result",
        svgString,
        sidecar,
        unmatched,
        nodeName: node.name,
      });
    } catch (err) {
      figma.ui.postMessage({
        type: "error",
        message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
};
