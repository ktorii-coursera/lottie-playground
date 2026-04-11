import { NextRequest, NextResponse } from "next/server";
import { DotLottie } from "@dotlottie/dotlottie-js";
import {
  convertWithIntentTokens,
  ThemeTokens,
} from "@/app/lib/intent-token-converter";

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

    // 1. Create original .lottie from unmodified input
    const originalDotLottie = new DotLottie();
    originalDotLottie.addAnimation({
      id: "animation-original",
      data: JSON.parse(JSON.stringify(lottieJson)),
    });
    const originalBuffer = await originalDotLottie.toArrayBuffer();
    const originalBase64 = Buffer.from(originalBuffer).toString("base64");
    allLogs.push("Created original.lottie from input JSON.");

    // 2. Create themed .lottie with slots + Light/Dark themes
    const themedResult = convertWithIntentTokens(lottieJson, tokens);
    allLogs.push(...themedResult.logs);

    const themedDotLottie = new DotLottie();
    themedDotLottie.addAnimation({
      id: "animation",
      data: themedResult.data,
    });

    // Light theme (provides animated keyframes for color transitions)
    if (themedResult.lightRules.length > 0) {
      themedDotLottie.addTheme({
        id: "Light",
        data: { rules: themedResult.lightRules },
      });
    }

    themedDotLottie.addTheme({
      id: "Dark",
      data: { rules: themedResult.darkRules },
    });

    const themedBuffer = await themedDotLottie.toArrayBuffer();
    const themedBase64 = Buffer.from(themedBuffer).toString("base64");
    allLogs.push("Created themed.lottie with Light + Dark themes.");

    return NextResponse.json({
      original: originalBase64,
      themed: themedBase64,
      themedJson: themedResult.data,
      lightRules: themedResult.lightRules,
      darkRules: themedResult.darkRules,
      logs: allLogs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Conversion failed" },
      { status: 500 }
    );
  }
}
