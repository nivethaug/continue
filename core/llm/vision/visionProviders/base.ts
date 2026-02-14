export abstract class VisionProvider {
  constructor(
    protected apiKey: string,
    protected apiBase?: string,
  ) {}

  abstract analyze(images: string[], prompt: string): Promise<string>;
}
