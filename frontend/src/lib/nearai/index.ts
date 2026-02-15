
export const NEAR_AI_CONFIG = {
  baseUrl: "https://cloud-api.near.ai/v1",
  defaultModel: "openai/gpt-oss-120b",
  availableModels: [
    { id: "openai/gpt-oss-120b", name: "GPT-OSS-120B", description: "NEAR AI TEE default" },
  ],
};

/**
 * Chat completion message format (OpenAI-compatible)
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Chat completion request options
 */
export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * NEAR AI Client class
 * 
 * Provides methods to interact with NEAR AI's API.
 */
export class NearAIClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, options?: { baseUrl?: string; model?: string }) {
    this.apiKey = apiKey;
    this.baseUrl = options?.baseUrl ?? NEAR_AI_CONFIG.baseUrl;
    this.model = options?.model ?? NEAR_AI_CONFIG.defaultModel;
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? this.model,
        messages,
        temperature: options?.temperature ?? 0,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NEAR AI API error (${response.status}): ${error}`);
    }

    const data: ChatCompletionResponse = await response.json();
    return data.choices[0]?.message?.content ?? "";
  }

  /**
   * Send a simple prompt and get a response
   */
  async prompt(userPrompt: string, options?: ChatCompletionOptions): Promise<string> {
    return this.chatCompletion(
      [{ role: "user", content: userPrompt }],
      options
    );
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.prompt("Say 'ok' if you can hear me.", {
        maxTokens: 10,
      });
      return response.toLowerCase().includes("ok");
    } catch {
      return false;
    }
  }

  /**
   * Update the API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Update the model
   */
  setModel(model: string): void {
    this.model = model;
  }
}

/**
 * Extract JSON from LLM response
 * Handles various formats: raw JSON, markdown code blocks, etc.
 */
export function extractJSON<T = unknown>(response: string): T | null {
  try {
    // Try to find JSON in markdown code block
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const cleaned = jsonMatch[1].trim().replace(/None/g, "null");
      return JSON.parse(cleaned) as T;
    }

    // Try to find JSON array or object directly
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const cleaned = arrayMatch[0].replace(/None/g, "null");
      return JSON.parse(cleaned) as T;
    }

    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const cleaned = objectMatch[0].replace(/None/g, "null");
      return JSON.parse(cleaned) as T;
    }

    // Try parsing the whole response
    const cleaned = response.replace(/None/g, "null");
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn("Failed to extract JSON from response:", response.slice(0, 200), err);
    return null;
  }
}

/**
 * Singleton instance for convenience
 */
let defaultClient: NearAIClient | null = null;

/**
 * Initialize the default NEAR AI client
 */
export function initNearAI(apiKey: string, options?: { baseUrl?: string; model?: string }): NearAIClient {
  defaultClient = new NearAIClient(apiKey, options);
  return defaultClient;
}

/**
 * Get the default NEAR AI client
 */
export function getNearAIClient(): NearAIClient | null {
  return defaultClient;
}

/**
 * Check if NEAR AI client is initialized
 */
export function isNearAIReady(): boolean {
  return defaultClient !== null;
}
