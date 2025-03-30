// Service for interacting with LLMs (e.g., OpenAI)
export interface LlmServiceOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CodeTransformRequest {
  code: string;
  instruction: string;
  language: string;
}

export class LlmService {
  private options: LlmServiceOptions;

  constructor(options: LlmServiceOptions) {
    this.options = options;
  }

  // Transform code using an LLM
  async transformCode(request: CodeTransformRequest): Promise<string> {
    try {
      const prompt = this.buildPrompt(request);
      const response = await this.sendToLlm(prompt);
      return this.extractCodeFromResponse(response);
    } catch (error) {
      console.error("Error transforming code:", error);
      throw new Error(`Failed to transform code: ${error}`);
    }
  }

  // Build the prompt for the LLM
  private buildPrompt(request: CodeTransformRequest): string {
    return `
    You are a coding assistant that helps modify code according to user instructions.
    Here is the original ${request.language} code:
    
    \`\`\`${request.language}
    ${request.code}
    \`\`\`
    
    User instruction: ${request.instruction}
    
    Please provide the modified code that fulfills this instruction. 
    Return only the complete modified code, no explanations or markdown formatting.
    The code should maintain the same overall structure unless specified otherwise in the instruction.
    `;
  }

  // Send the prompt to the LLM API
  private async sendToLlm(prompt: string): Promise<string> {
    // This is a placeholder - implement with your preferred LLM API
    // Example with a fake OpenAI-like API:
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          { role: "system", content: "You are a coding assistant." },
          { role: "user", content: prompt },
        ],
        max_tokens: this.options.maxTokens || 2048,
        temperature: this.options.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0].message.content;
  }

  // Extract just the code from the LLM response
  private extractCodeFromResponse(response: string): string {
    // If the response contains code blocks, extract the code
    const codeBlockRegex = /```(?:\w+)?\s*([\s\S]+?)```/;
    const match = response.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    // If no code blocks, assume the entire response is code
    return response.trim();
  }
}
