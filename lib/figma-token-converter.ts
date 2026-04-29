export interface FigmaColorValue {
  colorSpace: string;
  components: [number, number, number];
  alpha: number;
  hex: string;
}

export interface FigmaColorToken {
  $type: "color";
  $value: FigmaColorValue;
  $extensions?: {
    "com.figma.aliasData"?: {
      targetVariableName: string;
    };
    [key: string]: unknown;
  };
}

export interface GlobalTokenOutput {
  light: string;
  dark: string;
  alpha?: number;
}

export interface ConvertResult {
  tokens: Record<string, GlobalTokenOutput>;
  warnings: string[];
}

export function buildGlobalColorMap(
  globalColors: Record<string, unknown>
): Map<string, string> {
  const map = new Map<string, string>();

  function walk(obj: Record<string, unknown>, path: string) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("$")) continue;
      if (typeof value !== "object" || value === null) continue;

      const record = value as Record<string, unknown>;
      const currentPath = path ? `${path}/${key}` : key;

      if (record.$type === "color") {
        const hex = (record.$value as FigmaColorValue).hex;
        map.set(currentPath, hex);
      } else {
        walk(record, currentPath);
      }
    }
  }

  walk(globalColors, "");
  return map;
}

function resolveHex(
  token: FigmaColorToken,
  globalMap: Map<string, string>
): string {
  const alias =
    token.$extensions?.["com.figma.aliasData"]?.targetVariableName;
  if (alias) {
    const hex = globalMap.get(alias);
    if (hex) return hex;
  }
  return token.$value.hex;
}

export function collectIntentPaths(
  obj: Record<string, unknown>,
  prefix: string = ""
): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    if (typeof value !== "object" || value === null) continue;

    const record = value as Record<string, unknown>;
    const currentPath = prefix ? `${prefix}/${key}` : key;

    if (record.$type === "color") {
      paths.push(currentPath);
    } else {
      paths.push(...collectIntentPaths(record, currentPath));
    }
  }
  return paths;
}

function getNestedToken(
  obj: Record<string, unknown>,
  path: string
): FigmaColorToken | undefined {
  const parts = path.split("/");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (
    typeof current === "object" &&
    current !== null &&
    (current as Record<string, unknown>).$type === "color"
  ) {
    return current as FigmaColorToken;
  }
  return undefined;
}

export function convertFigmaTokens(
  globalColors: Record<string, unknown>,
  lightIntents: Record<string, unknown>,
  darkIntents: Record<string, unknown>
): ConvertResult {
  const globalMap = buildGlobalColorMap(globalColors);
  const warnings: string[] = [];
  const tokens: Record<string, GlobalTokenOutput> = {};

  const intentPaths = collectIntentPaths(lightIntents);

  for (const path of intentPaths) {
    const lightToken = getNestedToken(lightIntents, path)!;
    const darkToken = getNestedToken(darkIntents, path);

    const lightHex = resolveHex(lightToken, globalMap);
    let darkHex: string;

    if (!darkToken) {
      warnings.push(
        `WARNING: "${path}" exists in light but not dark — using light color for both`
      );
      darkHex = lightHex;
    } else {
      darkHex = resolveHex(darkToken, globalMap);
    }

    const entry: GlobalTokenOutput = { light: lightHex, dark: darkHex };

    const lightAlpha = lightToken.$value.alpha;
    if (lightAlpha !== undefined && lightAlpha !== 1) {
      entry.alpha = lightAlpha;
    }

    tokens[path] = entry;
  }

  return { tokens, warnings };
}
