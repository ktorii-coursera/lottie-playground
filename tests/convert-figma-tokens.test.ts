import { describe, it, expect } from "vitest";
import {
  buildGlobalColorMap,
  collectIntentPaths,
  convertFigmaTokens,
} from "../lib/figma-token-converter.js";

function makeColor(hex: string, alias?: string, alpha = 1) {
  const entry: any = {
    $type: "color",
    $value: {
      colorSpace: "srgb",
      components: [0, 0, 0],
      alpha,
      hex,
    },
    $extensions: {
      "com.figma.variableId": "VariableID:1:1",
      "com.figma.scopes": ["ALL_SCOPES"],
    },
  };
  if (alias) {
    entry.$extensions["com.figma.aliasData"] = {
      targetVariableName: alias,
    };
  }
  return entry;
}

describe("buildGlobalColorMap", () => {
  it("extracts flat color entries", () => {
    const global = {
      black: makeColor("#000000"),
    };
    const map = buildGlobalColorMap(global);
    expect(map.get("black")).toBe("#000000");
  });

  it("extracts nested color families", () => {
    const global = {
      grey: {
        "50": makeColor("#F2F5FA"),
        "950": makeColor("#2D3440"),
      },
      purple: {
        "200": makeColor("#E7D9FF"),
      },
    };
    const map = buildGlobalColorMap(global);
    expect(map.get("grey/50")).toBe("#F2F5FA");
    expect(map.get("grey/950")).toBe("#2D3440");
    expect(map.get("purple/200")).toBe("#E7D9FF");
    expect(map.size).toBe(3);
  });

  it("skips $-prefixed keys", () => {
    const global = {
      $extensions: { "com.figma.modeName": "Mode 1" },
      black: makeColor("#000000"),
    };
    const map = buildGlobalColorMap(global);
    expect(map.size).toBe(1);
  });
});

describe("collectIntentPaths", () => {
  it("collects leaf token paths preserving slashes", () => {
    const intents = {
      Vegetation: {
        Trunk: makeColor("#2D3440", "grey/950"),
        Foliage: {
          MidgroundDefault: makeColor("#93B73B", "avocado/500"),
        },
      },
      Canvas: {
        "background colour": makeColor("#FFFFFF"),
      },
    };
    const paths = collectIntentPaths(intents);
    expect(paths).toEqual([
      "Vegetation/Trunk",
      "Vegetation/Foliage/MidgroundDefault",
      "Canvas/background colour",
    ]);
  });
});

describe("convertFigmaTokens", () => {
  const globalColors = {
    grey: {
      "950": makeColor("#2D3440"),
      "975": makeColor("#1E2229"),
      "1000": makeColor("#0F1114"),
    },
    black: makeColor("#000000"),
    avocado: {
      "500": makeColor("#93B73B"),
      "600": makeColor("#659F42"),
    },
  };

  it("resolves intent tokens via alias to global hex values", () => {
    const light = {
      Vegetation: {
        Trunk: makeColor("#2D3440", "grey/950"),
      },
    };
    const dark = {
      Vegetation: {
        Trunk: makeColor("#1E2229", "grey/975"),
      },
    };

    const { tokens, warnings } = convertFigmaTokens(globalColors, light, dark);
    expect(tokens["Vegetation/Trunk"]).toEqual({
      light: "#2D3440",
      dark: "#1E2229",
    });
    expect(warnings).toHaveLength(0);
  });

  it("falls back to $value.hex when no aliasData", () => {
    const light = {
      Canvas: {
        "background colour": makeColor("#FFFFFF"),
      },
    };
    const dark = {
      Canvas: {
        "background colour": makeColor("#000000", "black"),
      },
    };

    const { tokens } = convertFigmaTokens(globalColors, light, dark);
    expect(tokens["Canvas/background colour"]).toEqual({
      light: "#FFFFFF",
      dark: "#000000",
    });
  });

  it("uses light color for both when dark token is missing", () => {
    const light = {
      Vegetation: {
        Trunk: makeColor("#2D3440", "grey/950"),
      },
    };
    const dark = {
      Vegetation: {},
    };

    const { tokens, warnings } = convertFigmaTokens(globalColors, light, dark);
    expect(tokens["Vegetation/Trunk"]).toEqual({
      light: "#2D3440",
      dark: "#2D3440",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Vegetation/Trunk");
    expect(warnings[0]).toContain("light color for both");
  });

  it("preserves alpha when not 1", () => {
    const light = {
      Glow: {
        Soft: makeColor("#FF0000", undefined, 0),
      },
    };
    const dark = {
      Glow: {
        Soft: makeColor("#FF0000", undefined, 0),
      },
    };

    const { tokens } = convertFigmaTokens(globalColors, light, dark);
    expect(tokens["Glow/Soft"]).toEqual({
      light: "#FF0000",
      dark: "#FF0000",
      alpha: 0,
    });
  });

  it("omits alpha when it equals 1", () => {
    const light = {
      Vegetation: {
        Trunk: makeColor("#2D3440", "grey/950", 1),
      },
    };
    const dark = {
      Vegetation: {
        Trunk: makeColor("#1E2229", "grey/975", 1),
      },
    };

    const { tokens } = convertFigmaTokens(globalColors, light, dark);
    expect(tokens["Vegetation/Trunk"].alpha).toBeUndefined();
  });

  it("handles deeply nested paths", () => {
    const light = {
      Vegetation: {
        Foliage: {
          MidgroundDefault: makeColor("#93B73B", "avocado/500"),
        },
      },
    };
    const dark = {
      Vegetation: {
        Foliage: {
          MidgroundDefault: makeColor("#659F42", "avocado/600"),
        },
      },
    };

    const { tokens } = convertFigmaTokens(globalColors, light, dark);
    expect(tokens["Vegetation/Foliage/MidgroundDefault"]).toEqual({
      light: "#93B73B",
      dark: "#659F42",
    });
  });

  it("handles full pipeline with multiple token categories", () => {
    const light = {
      Vegetation: {
        Trunk: makeColor("#2D3440", "grey/950"),
        Shadow: makeColor("#0F1114", "grey/1000"),
      },
      Canvas: {
        "background colour": makeColor("#FFFFFF"),
      },
    };
    const dark = {
      Vegetation: {
        Trunk: makeColor("#1E2229", "grey/975"),
        Shadow: makeColor("#000000", "black"),
      },
      Canvas: {
        "background colour": makeColor("#000000", "black"),
      },
    };

    const { tokens, warnings } = convertFigmaTokens(globalColors, light, dark);
    expect(Object.keys(tokens)).toHaveLength(3);
    expect(tokens["Vegetation/Trunk"]).toEqual({ light: "#2D3440", dark: "#1E2229" });
    expect(tokens["Vegetation/Shadow"]).toEqual({ light: "#0F1114", dark: "#000000" });
    expect(tokens["Canvas/background colour"]).toEqual({ light: "#FFFFFF", dark: "#000000" });
    expect(warnings).toHaveLength(0);
  });
});
