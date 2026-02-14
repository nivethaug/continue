// Vision fallback configuration type
export type VisionConfig = {
  enabled?: boolean;
  provider?: "glm-4.6v" | "gpt-4o-mini-vision";
  apiKey?: string;
  apiBase?: string;
};

export default VisionConfig;
