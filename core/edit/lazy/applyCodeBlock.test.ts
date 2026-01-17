import { lazyApplyPromptForModel } from "./prompts";

describe("lazyApplyPromptForModel - Agent Mode", () => {
  const originalEnv = process.env.DREAMCODE_AGENT;

  afterEach(() => {
    // Clean up environment after each test
    if (originalEnv === undefined) {
      delete process.env.DREAMCODE_AGENT;
    } else {
      process.env.DREAMCODE_AGENT = originalEnv;
    }
  });

  describe("when agent mode is enabled", () => {
    beforeEach(() => {
      process.env.DREAMCODE_AGENT = "true";
    });

    it("should return undefined for sonnet models", () => {
      const result = lazyApplyPromptForModel(
        "claude-3-5-sonnet-20241022",
        "anthropic",
      );
      expect(result).toBeUndefined();
    });

    it("should return undefined for non-sonnet models", () => {
      const result = lazyApplyPromptForModel("gpt-4", "openai");
      expect(result).toBeUndefined();
    });
  });

  describe("when agent mode is disabled", () => {
    beforeEach(() => {
      delete process.env.DREAMCODE_AGENT;
    });

    it("should return prompt function for sonnet models", () => {
      const result = lazyApplyPromptForModel(
        "claude-3-5-sonnet-20241022",
        "anthropic",
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("function");
    });

    it("should return undefined for non-sonnet models", () => {
      const result = lazyApplyPromptForModel("gpt-4", "openai");
      expect(result).toBeUndefined();
    });
  });
});
