
import { CargoItem, PackingResult, AIConfig, ChatMsg } from "../types";

// 1. Data Extraction Prompt (Strict JSON)
export const DATA_EXTRACTION_PROMPT = `
You are a Data Extraction Engine. 
Your ONLY purpose is to extract cargo specifications from the input into a strict JSON format for the "Forklift Desirer" 3D packing engine.

OUTPUT RULES:
- Return ONLY a JSON array.
- No markdown formatting, no conversational text, no explanations.
- If no cargo data is found, return an empty array: []

DATA FIELDS:
1. name: string (Item Name)
2. qty: number (Quantity)
3. l: number (Length in cm)
4. w: number (Width in cm)
5. h: number (Height in cm)
6. weight: number (Weight in kg)
7. unstackable: boolean (Identify keywords: "fragile", "do not stack", "top load")

UNIT CONVERSION:
- Convert ALL dimensions to Centimeters (cm).
- Convert ALL weights to Kilograms (kg).

EXAMPLE OUTPUT:
[
  { "name": "Box A", "qty": 10, "l": 50, "w": 30, "h": 20, "weight": 5, "unstackable": false },
  { "name": "Long Tube", "qty": 2, "l": 200, "w": 10, "h": 10, "weight": 15, "unstackable": true }
]
`;

// 2. Advisor Prompt (Conversational, NO data extraction)
export const ADVISOR_PROMPT = `
You are a Senior Logistics Advisor for "Forklift Desirer".
Your role is to answer questions about packing efficiency, warehouse operations, and logistics best practices.

IMPORTANT:
- Do NOT try to extract cargo data or generate JSON.
- Do NOT try to calculate container counts or perform complex 3D packing math (the engine does this).
- If the user asks for packaging advice, remember:
  * Our engine enforces a 17cm overhead clearance (15cm forklift + 2cm buffer).
  * Max loading heights: 20GP/40GP (~221cm), 40HQ (~251cm).
- Keep answers concise and professional.
`;

// 3. Intent Classification Prompt
const CLASSIFICATION_PROMPT = `
Analyze the following user input (and images if any).
Does this input contain specific cargo/shipment data (dimensions, weights, quantities) that needs to be extracted for packing?
Reply EXACTLY with "YES" or "NO". Do not add any punctuation or extra text.
`;

// Legacy export for backward compatibility if needed, though we should migrate away.
export const systemPrompt = DATA_EXTRACTION_PROMPT; 

export const extractCargoJSON = (text: string): any[] | null => {
  let allItems: any[] = [];
  let found = false;

  // 1. Try finding Code Block JSON (Global search to find ALL blocks)
  // Regex explanation:
  // ```json\s* matches start of block, allowing for flexible whitespace/newline
  // ([\s\S]*?) matches the content non-greedily
  // \s*``` matches the end of block
  const codeBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match[1]) {
          try {
              const parsed = JSON.parse(match[1]);
              if (Array.isArray(parsed)) {
                  allItems = [...allItems, ...parsed];
                  found = true;
              } else if (typeof parsed === 'object' && parsed !== null) {
                  // Single object fallback
                   allItems.push(parsed);
                   found = true;
              }
          } catch (e) { 
              console.warn("JSON parse error in block, skipping.", e); 
          }
      }
  }

  if (found) return allItems;

  // 2. Fallback: Try parsing raw text if it looks like JSON array and no code blocks were found
  const trimmed = text.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try { 
          const parsed = JSON.parse(trimmed); 
          if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
  }

  // 3. Deep Search Fallback: Find the first '[' and last ']'
  const firstOpen = text.indexOf('[');
  const lastClose = text.lastIndexOf(']');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      const potentialJson = text.substring(firstOpen, lastClose + 1);
      try {
          const parsed = JSON.parse(potentialJson);
          if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
  }

  return null;
};

export class AIService {
  private config: AIConfig;
  constructor(config: AIConfig) { this.config = config; }

  static async getOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<string[]> {
      try {
          const response = await fetch(`${baseUrl}/api/tags`);
          if (!response.ok) return [];
          const data = await response.json();
          return data.models ? data.models.map((m: any) => m.name) : [];
      } catch (e) {
          console.warn("Failed to fetch Ollama models", e);
          return [];
      }
  }

  // New method: Determine intent
  async classifyIntent(msg: ChatMsg): Promise<'DATA' | 'CHAT'> {
    const response = await this.sendInternal(msg, CLASSIFICATION_PROMPT, 'NO_CONTEXT');
    const cleanResponse = response.trim().toUpperCase().replace(/[^A-Z]/g, '');
    return cleanResponse.includes('YES') ? 'DATA' : 'CHAT';
  }

  // Unified method to send message with specific prompt
  async sendMessage(history: ChatMsg[], context?: { cargoItems: CargoItem[], result: PackingResult, containerName: string }, overridePrompt?: string): Promise<string> {
    let contextStr = "";
    if (context) {
        const summary = context.cargoItems.map(c => `- ${c.name}: ${c.quantity}x (${c.dimensions.length}x${c.dimensions.width}x${c.dimensions.height})cm`).join('\n');
        contextStr = `Current Container: ${context.containerName}\nUtil: ${context.result.volumeUtilization.toFixed(1)}%\nManifest:\n${summary}`;
    }
    
    const latestMsg = history[history.length - 1];
    
    // Check intent only if no override prompt is provided
    if (!overridePrompt) {
        // This logic is moved to App.tsx usually, but if called directly:
         return this.sendInternal(latestMsg, ADVISOR_PROMPT, contextStr);
    } else {
         return this.sendInternal(latestMsg, overridePrompt, contextStr);
    }
  }

  // Internal sender that handles provider details
  private async sendInternal(msg: ChatMsg, sysPrompt: string, contextStr: string): Promise<string> {
      switch (this.config.provider) {
        case 'ollama':
            return this.sendToOllama(msg, sysPrompt, contextStr);
        case 'openai':
        case 'lmstudio':
            return this.sendToOpenAICompatible(msg, sysPrompt, contextStr);
        default:
            return "Provider not implemented.";
    }
  }

  private async sendToOllama(msg: ChatMsg, sysPrompt: string, contextStr: string): Promise<string> {
      const baseUrl = this.config.baseUrl || 'http://localhost:11434';
      const model = this.config.modelName || 'llama3';
      
      const content = contextStr === 'NO_CONTEXT' ? msg.text : `${contextStr}\n\nUser: ${msg.text}`;
      
      const messageObj: any = { role: 'user', content: content };
      
      if (msg.attachments && msg.attachments.length > 0) {
          const images: string[] = [];
          for (const att of msg.attachments) {
              if (att.base64) images.push(att.base64.split(',')[1]);
          }
          if (images.length > 0) messageObj.images = images;
      }

      const body = {
          model: model,
          messages: [
              { role: 'system', content: sysPrompt },
              messageObj
          ],
          stream: false,
          options: { temperature: sysPrompt === DATA_EXTRACTION_PROMPT ? 0.0 : 0.7 } // Low temp for data
      };

      try {
          const response = await fetch(`${baseUrl}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
          });
          
          if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);
          const data = await response.json();
          return data.message?.content || "No response content.";
      } catch (e: any) {
          return `Error connecting to Ollama: ${e.message}. Ensure Ollama is running and OLLAMA_ORIGINS="*" is set.`;
      }
  }

  private async sendToOpenAICompatible(msg: ChatMsg, sysPrompt: string, contextStr: string): Promise<string> {
      const baseUrl = this.config.baseUrl || (this.config.provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'https://api.openai.com/v1');
      const apiKey = this.config.apiKey || 'not-needed';
      const model = this.config.modelName || 'local-model';

      const content = [
          { type: "text", text: contextStr === 'NO_CONTEXT' ? msg.text : `${contextStr}\n\nUser: ${msg.text}` }
      ];

      if (msg.attachments) {
          for (const att of msg.attachments) {
              if (att.base64) {
                  // OpenAI content format for images
                  content.push({ type: "image_url", image_url: { url: att.base64 } } as any);
              }
          }
      }

      const body = {
          model: model,
          messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: this.config.provider === 'lmstudio' ? (contextStr === 'NO_CONTEXT' ? msg.text : `${contextStr}\n\nUser: ${msg.text}`) : content } 
          ],
          temperature: sysPrompt === DATA_EXTRACTION_PROMPT ? 0.0 : 0.7
      };
      
      try {
          const response = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify(body)
          });

          if (!response.ok) {
              const errText = await response.text();
              throw new Error(`API Error: ${response.status} ${errText}`);
          }
          const data = await response.json();
          return data.choices?.[0]?.message?.content || "No response.";
      } catch (e: any) {
          return `Error: ${e.message}`;
      }
  }
}

