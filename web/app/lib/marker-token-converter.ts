// Marker-based conversion logic for Lottie theming (v3).
// Reads AEUX_TOKENS markers on layers instead of matching by layer name.
// This is a web-app copy of ../../lib/marker-token-converter.ts

export interface ThemeToken {
  light: string;
  dark: string;
  alpha?: number;
}

export interface ThemeTokens {
  [tokenName: string]: ThemeToken;
}

export interface ConversionResult {
  data: any;
  slots: Record<string, any>;
  lightRules: any[];
  darkRules: any[];
  logs: string[];
}

function parseLayerNameTokens(layerName: string): string[] {
  const match = layerName.match(/\[([^\]]+)\]/);
  if (!match) return [];
  return match[1].split(",").map((t) => t.trim()).filter(Boolean);
}

function hexToRgb01(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [
    Math.round(r * 10000) / 10000,
    Math.round(g * 10000) / 10000,
    Math.round(b * 10000) / 10000,
  ];
}

function colorsMatch(lottieRgb: number[], targetHex: string): boolean {
  const [tr, tg, tb] = hexToRgb01(targetHex);
  return (
    Math.abs(Math.round(lottieRgb[0] * 255) - Math.round(tr * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[1] * 255) - Math.round(tg * 255)) <= 1 &&
    Math.abs(Math.round(lottieRgb[2] * 255) - Math.round(tb * 255)) <= 1
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function toThemeKeyframes(lottieKeyframes: any[]): any[] {
  return lottieKeyframes.map((kf: any) => {
    const entry: any = {
      frame: Math.round(kf.t),
      value: kf.s ? [...kf.s] : undefined,
    };
    if (kf.i) entry.inTangent = {
      x: Array.isArray(kf.i.x) ? kf.i.x[0] : kf.i.x,
      y: Array.isArray(kf.i.y) ? kf.i.y[0] : kf.i.y,
    };
    if (kf.o) entry.outTangent = {
      x: Array.isArray(kf.o.x) ? kf.o.x[0] : kf.o.x,
      y: Array.isArray(kf.o.y) ? kf.o.y[0] : kf.o.y,
    };
    return entry;
  });
}

export function convertWithMarkerTokens(
  lottieData: any,
  tokens: ThemeTokens
): ConversionResult {
  const data = JSON.parse(JSON.stringify(lottieData));
  const logs: string[] = [];

  const slots: Record<string, any> = {};
  const lightRules: any[] = [];
  const darkRules: any[] = [];
  const registeredSlots = new Set<string>();
  let transitionCounter = 0;

  function matchAgainstMarkerTokens(
    rgb: number[],
    markerTokenNames: string[]
  ): { tokenName: string; lightRgb: [number, number, number]; darkRgb: [number, number, number] } | null {
    for (const tokenName of markerTokenNames) {
      const tokenDef = tokens[tokenName];
      if (!tokenDef) continue;
      if (colorsMatch(rgb, tokenDef.light)) {
        return {
          tokenName,
          lightRgb: hexToRgb01(tokenDef.light),
          darkRgb: hexToRgb01(tokenDef.dark),
        };
      }
    }
    return null;
  }

  function registerStaticSlot(
    slotId: string,
    lightRgb: [number, number, number],
    darkRgb: [number, number, number]
  ) {
    if (registeredSlots.has(slotId)) return;
    registeredSlots.add(slotId);
    slots[slotId] = { p: { a: 0, k: [...lightRgb] } };
    lightRules.push({ id: slotId, type: "Color", value: [...lightRgb] });
    darkRules.push({ id: slotId, type: "Color", value: [...darkRgb] });
  }

  function registerAnimatedSlot(
    slotId: string,
    originalKeyframes: any[],
    darkKeyframes: any[]
  ) {
    if (registeredSlots.has(slotId)) return;
    registeredSlots.add(slotId);
    lightRules.push({ id: slotId, type: "Color", keyframes: toThemeKeyframes(originalKeyframes) });
    darkRules.push({ id: slotId, type: "Color", keyframes: toThemeKeyframes(darkKeyframes) });
  }

  function processColor(colorProp: any, layerName: string, markerTokenNames: string[]) {
    if (colorProp.a === 0) {
      const match = matchAgainstMarkerTokens(colorProp.k, markerTokenNames);
      if (match) {
        colorProp.sid = match.tokenName;
        registerStaticSlot(match.tokenName, match.lightRgb, match.darkRgb);
        logs.push(`Static match: ${rgbToHex(colorProp.k[0], colorProp.k[1], colorProp.k[2])} → slot "${match.tokenName}"`);
      }
    } else if (colorProp.a === 1) {
      const originalKeyframes = JSON.parse(JSON.stringify(colorProp.k));
      const darkKeyframes = JSON.parse(JSON.stringify(colorProp.k));
      let matchedAny = false;
      let firstLightRgb: [number, number, number] | null = null;
      if (originalKeyframes[0]?.s && originalKeyframes[0].s.length >= 3) {
        firstLightRgb = [originalKeyframes[0].s[0], originalKeyframes[0].s[1], originalKeyframes[0].s[2]];
      }
      for (const keyframe of darkKeyframes) {
        if (keyframe.s && Array.isArray(keyframe.s) && keyframe.s.length >= 3) {
          const match = matchAgainstMarkerTokens(keyframe.s, markerTokenNames);
          if (match) {
            const alpha = keyframe.s.length > 3 ? keyframe.s[3] : 1;
            keyframe.s = [...match.darkRgb, alpha];
            matchedAny = true;
          }
        }
      }
      if (matchedAny && firstLightRgb) {
        transitionCounter++;
        const sid = `${layerName}_color_${transitionCounter}`;
        colorProp.a = 0;
        colorProp.k = [...firstLightRgb];
        colorProp.sid = sid;
        registerAnimatedSlot(sid, originalKeyframes, darkKeyframes);
        logs.push(`Animated match: layer "${layerName}" → sid "${sid}" + light/dark keyframes`);
      }
    }
  }

  function walkShapes(shapes: any[], layerName: string, markerTokenNames: string[]) {
    for (const shape of shapes) {
      if (shape.ty === "gr" && shape.it) {
        walkShapes(shape.it, layerName, markerTokenNames);
      } else if (shape.ty === "fl" || shape.ty === "st") {
        if (shape.c) {
          processColor(shape.c, layerName, markerTokenNames);
        }
      }
    }
  }

  const allLayers: any[] = [];
  if (data.layers) allLayers.push(...data.layers);
  if (data.assets) {
    for (const asset of data.assets) {
      if (asset.layers) allLayers.push(...asset.layers);
    }
  }

  for (const layer of allLayers) {
    if (layer.ty !== 4) continue;
    const markerTokenNames = parseLayerNameTokens(layer.nm);
    if (markerTokenNames.length === 0) continue;
    logs.push(`Matched layer: "${layer.nm}" (tokens: ${markerTokenNames.join(", ")})`);
    if (layer.shapes) {
      walkShapes(layer.shapes, layer.nm, markerTokenNames);
    }
  }

  data.slots = Object.keys(slots).length > 0 ? slots : null;
  logs.push(`Done: ${Object.keys(slots).length} slot(s), ${lightRules.length} light rule(s), ${darkRules.length} dark rule(s)`);

  return { data, slots, lightRules, darkRules, logs };
}
