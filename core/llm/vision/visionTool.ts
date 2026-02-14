export type VisionImageInput =
  | { type: "path"; value: string }
  | { type: "buffer"; value: Buffer };

const FIXED_PROMPT =
  "You will be given one or more images such as UI screenshots, dashboards, diagrams, code snippets, or terminal output. " +
  "Your task is to extract ONLY meaningful, non-repetitive, visually important information in a compact form suitable for another language model. " +
  "GENERAL RULES: " +
  "- Focus on semantic content, not exhaustive OCR. " +
  "- Ignore repeated, disabled, placeholder, decorative, or empty UI elements. " +
  "- NEVER repeat the same text many times. Summarize repetitions once. " +
  "- Do NOT output raw OCR dumps. " +
  "TEXT HANDLING: " +
  "- Extract visible text ONLY if it adds meaning. " +
  "- Preserve wording, but NOT exact visual duplication. " +
  "- Combine identical labels, cards, or items into a single representative entry. " +
  "TAGGING (USE SPARINGLY): " +
  "You MAY prefix text with one of these tags ONLY when clearly applicable: " +
  "[CODE], [TERMINAL], [ERROR], [HEADER], [BUTTON], [SECTION], [MODAL], [NAV]. " +
  "Do NOT stack multiple tags on the same line. " +
  "CODE RULE: " +
  "Use [CODE] ONLY when real programming syntax is visible. " +
  "STRUCTURE: " +
  "- After text extraction, include a short STRUCTURE_HINTS section describing high-level layout or sections. " +
  "- Keep STRUCTURE_HINTS under 5 bullet points. " +
  "STRICTLY FORBIDDEN: " +
  "- Do NOT repeat UI elements verbatim. " +
  "- Do NOT annotate size, alignment, color, font, spacing, or state like [DISABLED]. " +
  "- Do NOT speculate or infer intent. " +
  "- Do NOT generate HTML, CSS, JavaScript, or fixes. " +
  "OUTPUT FORMAT (plain text): " +
  "Image 1:\n<concise extracted content>\n\n" +
  "STRUCTURE_HINTS:\n<brief high-level structure>";

export async function analyzeImages(
  images: VisionImageInput[],
  visionConfig?: any,
): Promise<string | null> {
  try {
    console.log("analyzeImages called with images:", visionConfig);
    if (!visionConfig?.enabled) return null;
    if (!visionConfig.provider || !visionConfig.apiKey) return null;
    if (images.length === 0) return null;

    switch (visionConfig.provider) {
      case "glm-4.6v": {
        const { analyzeWithGLM46V } =
          await import("./visionProviders/glm46v.js");
        return await analyzeWithGLM46V(images, FIXED_PROMPT, visionConfig);
      }

      case "gpt-4o-mini-vision": {
        const { analyzeWithGPT4oVision } =
          await import("./visionProviders/gpt4oVision.js");
        return await analyzeWithGPT4oVision(images, FIXED_PROMPT, visionConfig);
      }

      default:
        return null;
    }
  } catch {
    // FAIL CLOSED
    return null;
  }
}
