// core/llm/vision/visionProviders/glm46v.ts

import { fetchwithRequestOptions } from "@continuedev/fetch";
import { VisionImageInput } from "../visionTool";

export async function analyzeWithGLM46V(
  images: VisionImageInput[],
  prompt: string,
  visionConfig: {
    apiKey: string;
    apiBase?: string;
  },
): Promise<string> {
  const url = visionConfig.apiBase
    ? `${visionConfig.apiBase}/chat/completions`
    : "https://open.bigmodel.cn/api/paas/v4/chat/completions";

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
    model: "glm-4.6v",
    thinking: {
      type: "disabled",
      clear_thinking: true,
    },
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

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  console.log("GLM-4.6V visigon response text:", data);
  if (typeof text !== "string") {
    throw new Error("Vision provider error");
  }

  return text;
}
