import { ChatMessage } from "../../index.js";

import { analyzeImages } from "./visionTool.js";

function extractUserText(message: ChatMessage): string {
  if (message.role !== "user" || !Array.isArray(message.content)) {
    return "";
  }
  let text = "";
  for (const part of message.content) {
    if (part.type === "text") {
      text += part.text ?? "";
    }
  }
  return text;
}

function extractImages(
  message: ChatMessage,
): Array<{ type: "path" | "buffer"; value: string }> {
  if (message.role !== "user" || !Array.isArray(message.content)) {
    return [];
  }
  const images: Array<{ type: "path" | "buffer"; value: string }> = [];
  for (const part of message.content) {
    if (part.type === "imageUrl") {
      if (part.imageUrl?.url.indexOf("data:") !== 0) {
        images.push({ type: "buffer", value: part.imageUrl.url });
      } else {
        images.push({ type: "path", value: part.imageUrl.url });
      }
    }
  }
  return images;
}

function removeImagesFromMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === "user" && Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join(""),
      };
    }
    return m;
  });
}

export async function preprocessMessagesForVision(
  messages: ChatMessage[],
  mainLlmCapabilities: { vision?: boolean },
  visionConfig?: {
    enabled: boolean;
    provider: "glm-4.6v" | "gpt-4o-mini-vision";
    apiKey: string;
    apiBase?: string;
  },
  minorLlm?: any, // Optional minor LLM for intent classification
): Promise<ChatMessage[]> {
  const images: any = [];
  let usertext = "";
  console.log("Preprocessing messages for vision with messages:", messages);

  for (const message of messages) {
    if (message.role === "user") {
      const extractedImages = extractImages(message);
      images.push(...extractedImages);
      usertext += extractUserText(message);
    }
  }

  console.log("Extracted images for vision analysis:", images, visionConfig);

  // Default: TEXT_EXTRACT intent → proceed with vision preprocessing

  // Skip vision if main LLM has native vision or no images
  if (images.length === 0 || mainLlmCapabilities?.vision) {
    return messages;
  }

  // Skip vision if vision config is missing or disabled
  if (
    !visionConfig?.enabled ||
    !visionConfig.apiKey ||
    !visionConfig.provider
  ) {
    return removeImagesFromMessages(messages);
  }

  // FAIL-CLOSED: Any error → strip images, preserve user text
  let visionDescription: string | null = null;
  try {
    visionDescription = await analyzeImages(images, visionConfig);
  } catch {
    // FAIL CLOSED: Return messages with images removed but text preserved
    return removeImagesFromMessages(messages);
  }

  if (visionDescription === null) {
    // FAIL CLOSED: Null result → strip images, preserve user text
    return removeImagesFromMessages(messages);
  }

  // Inject vision description in exact format required by downstream consumers
  return messages.map((message) => {
    if (
      message.role === "user" &&
      Array.isArray(message.content) &&
      message.content.some((p) => p.type === "imageUrl")
    ) {
      return {
        role: "user",
        content:
          `User provided images. Extracted description:\n\n` +
          `${visionDescription}` +
          `\n\nUser text:\n${usertext}`,
      };
    }
    return message;
  });
}
