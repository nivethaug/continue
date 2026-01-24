import { streamSse } from "@continuedev/fetch";
import { ChatMessage, CompletionOptions, LLMOptions } from "../../index.js";
import {
  toChatBody,
  fromChatCompletionChunk,
} from "../openaiTypeConverters.js";

import OpenAI from "./OpenAI.js";

class GLM extends OpenAI {
  static providerName = "glm";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.z.ai/api/coding/paas/v4/",
    model: "glm-4.7",
    contextLength: 204800,
  };

  // Disable completions endpoint - always use chat completions
  override supportsCompletions(): boolean {
    return false;
  }

  // Disable template system - send clean messages directly
  override templateMessages: ((messages: ChatMessage[]) => string) | undefined =
    undefined;

  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    const body: any = toChatBody(messages, options, {
      includeReasoningField: this.supportsReasoningField,
      includeReasoningDetailsField: this.supportsReasoningDetailsField,
    });

    const endpoint = this.apiBase + "chat/completions";

    console.log("[GLM DEBUG] ==================");
    console.log("[GLM DEBUG] Endpoint:", endpoint);
    console.log(
      "[GLM DEBUG] Messages:",
      JSON.stringify(body.messages, null, 2),
    );
    console.log("[GLM DEBUG] =====================");

    const response = await this.fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        ...body,
        stream: true,
      }),
      signal,
    });

    console.log("[GLM DEBUG] Response status:", response.status);

    for await (const value of streamSse(response)) {
      const chunk = fromChatCompletionChunk(value);
      if (chunk) {
        yield chunk;
      }
    }
  }
}

export default GLM;
