// core/llm/vision/visionProviders/gpt4oVision.ts

import { fetchwithRequestOptions } from "@continuedev/fetch";
import { VisionImageInput } from "../visionTool";

export async function analyzeWithGPT4oVision(
  images: VisionImageInput[],
  prompt: string,
  visionConfig: {
    apiKey: string;
    apiBase?: string;
  },
): Promise<string> {
  const url =
    visionConfig.apiBase ?? "https://api.openai.com/v1/chat/completions";

  const imageParts = images.map((img) => {
    if (img.type === "path") {
      return {
        type: "image_url" as const,
        image_url: { url: img.value },
      };
    }

    return {
      type: "image_url" as const,
      image_url: {
        url: `data:image/png;base64,${img.value.toString("base64")}`,
      },
    };
  });

  const body = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageParts],
      },
    ],
  };

  const response = await fetchwithRequestOptions(new URL(url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${visionConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Vision provider error");
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (typeof text !== "string") {
    throw new Error("Vision provider error");
  }

  return text;
}
