import { NextRequest, NextResponse } from "next/server";
import { DotLottie } from "@dotlottie/dotlottie-js";
import {
  createDarkLottie,
  createThemedLottie,
  ThemeTokens,
} from "@/app/lib/lottie-convert";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { lottieJson, tokens } = (await req.json()) as {
      lottieJson: any;
      tokens: ThemeTokens;
    };

    if (!lottieJson || !tokens) {
      return NextResponse.json(
        { error: "Missing lottieJson or tokens" },
        { status: 400 }
      );
    }

    const allLogs: string[] = [];

    // 1. Create light.lottie from original JSON
    const lightDotLottie = new DotLottie();
    lightDotLottie.addAnimation({
      id: "animation-light",
      data: JSON.parse(JSON.stringify(lottieJson)),
    });
    const lightBuffer = await lightDotLottie.toArrayBuffer();
    const lightBase64 = Buffer.from(lightBuffer).toString("base64");
    allLogs.push("Created light.lottie from original JSON.");

    // 2. Create dark.lottie (color-swapped)
    const darkResult = createDarkLottie(lottieJson, tokens);
    allLogs.push(...darkResult.logs);

    const darkDotLottie = new DotLottie();
    darkDotLottie.addAnimation({
      id: "animation-dark",
      data: darkResult.data,
    });
    const darkBuffer = await darkDotLottie.toArrayBuffer();
    const darkBase64 = Buffer.from(darkBuffer).toString("base64");
    allLogs.push("Created dark.lottie.");

    // 3. Create themed.lottie (with slots + dark theme)
    const themedResult = createThemedLottie(lottieJson, tokens);
    allLogs.push(...themedResult.logs);

    const themedDotLottie = new DotLottie();
    themedDotLottie.addAnimation({
      id: "animation",
      data: themedResult.data,
    });
    themedDotLottie.addTheme({
      id: "Dark",
      data: {
        rules: themedResult.darkRules,
      },
    });
    const themedBuffer = await themedDotLottie.toArrayBuffer();
    const themedBase64 = Buffer.from(themedBuffer).toString("base64");
    allLogs.push("Created themed.lottie with Dark theme.");

    return NextResponse.json({
      light: lightBase64,
      dark: darkBase64,
      themed: themedBase64,
      logs: allLogs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Conversion failed" },
      { status: 500 }
    );
  }
}
