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
  private apiKey: string;

  constructor(options: LlmServiceOptions) {
    this.options = options;
    this.apiKey = "";
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
    console.log("LLM Prompt:", prompt);

    const requestBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    console.log("Full LLM Request Body (Stringified):", requestBody);

    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: requestBody,
        }
      );

      if (!response.ok) {
        const errorText = await response.text(); // Get the error message
        console.error("Full API Response:", {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: errorText, // Include the response body
        });
        throw new Error(
          `API error: ${response.status} ${response.statusText}: ${errorText}`
        );
      }

      interface LlmApiResponse {
        candidates: { content: { parts: { text: string }[] } }[];
      }

      const data: LlmApiResponse = (await response.json()) as LlmApiResponse;
      const rawResponse = data.candidates[0]?.content.parts[0]?.text || "";
      console.log("LLM Raw Response:", rawResponse);
      return rawResponse;
    } catch (error) {
      console.error("Error sending to LLM:", error);
      throw error; // Re-throw the error to be caught in transformCode
    }
  }
  async getCompletion(prompt: string): Promise<string> {
    try {
      const response = await this.sendToLlm(prompt);
      return response;
    } catch (error) {
      console.error("Error getting completion:", error);
      throw new Error(`Failed to get completion: ${error}`);
    }
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
