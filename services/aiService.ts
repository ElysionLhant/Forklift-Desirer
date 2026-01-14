
import { CargoItem, PackingResult, AIConfig, ChatMsg } from "../types";

const systemPrompt = `
You are a Senior Logistics Advisor for "Forklift Desirer".
Your mission: Help users maximize container utilization and calculate minimum container count needed.

CORE CONSTRAINTS:
- Functional Height Limit = Container Height - 17cm (2cm buffer + 15cm forklift lift clearance).
- 20GP/40GP loading limit: ~222cm.
- 40HQ loading limit: ~252cm.

AI CAPABILITIES:
1. EXTRACT cargo dimensions/qty from input text or images.
2. RECOMMEND container types (favoring 20GP over 40GP/HQ if it fits).

JSON OUTPUT FORMAT:
\`\`\`json
[
  { 
    "name": "Item Name", 
    "qty": 10, 
    "l": 100, 
    "w": 50, 
    "h": 50, 
    "weight": 20,
    "unstackable": false 
  }
]
\`\`\`

IMPORTANT: 
- Do NOT provide specific price quotes or currency calculations.
- Focus on space optimization and explaining height constraints based on forklift operations.
- Always assume 15cm of clearance is needed at the top for fork lifting.
`;

export const extractCargoJSON = (text: string): any[] | null => {
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    try { return JSON.parse(jsonMatch[1]); } catch (e) { console.error("JSON parse error", e); }
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

  async sendMessage(history: ChatMsg[], context?: { cargoItems: CargoItem[], result: PackingResult, containerName: string }): Promise<string> {
    let contextStr = "";
    if (context) {
        const summary = context.cargoItems.map(c => `- ${c.name}: ${c.quantity}x (${c.dimensions.length}x${c.dimensions.width}x${c.dimensions.height})cm`).join('\n');
        contextStr = `Current Container: ${context.containerName}\nUtil: ${context.result.volumeUtilization.toFixed(1)}%\nManifest:\n${summary}`;
    }
    const latestMsg = history[history.length - 1];
    
    switch (this.config.provider) {
        case 'ollama':
            return this.sendToOllama(latestMsg, contextStr);
        case 'openai':
        case 'lmstudio':
            return this.sendToOpenAICompatible(latestMsg, contextStr);
        default:
            return "Provider not implemented.";
    }
  }

  private async sendToOllama(msg: ChatMsg, contextStr: string): Promise<string> {
      const baseUrl = this.config.baseUrl || 'http://localhost:11434';
      const model = this.config.modelName || 'llama3';
      
      const content = `${contextStr}\n\nUser: ${msg.text}`;
      
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
              { role: 'system', content: systemPrompt },
              messageObj
          ],
          stream: false
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

  private async sendToOpenAICompatible(msg: ChatMsg, contextStr: string): Promise<string> {
      const baseUrl = this.config.baseUrl || (this.config.provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'https://api.openai.com/v1');
      const apiKey = this.config.apiKey || 'not-needed';
      const model = this.config.modelName || 'local-model';

      const content = [
          { type: "text", text: `${contextStr}\n\nUser: ${msg.text}` }
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
              { role: 'system', content: systemPrompt },
              { role: 'user', content: this.config.provider === 'lmstudio' ? `${contextStr}\n\nUser: ${msg.text}` : content } 
          ],
          temperature: 0.7
      };

      // LM Studio and some local inferencing servers might not support the complex content array for 'user', so we fallback to string if attachments are empty or simplified logic is preferred. 
      // But for now, we try standard structure. Note: LM Studio often prefers simple string content in 'user' role if not using vision specific APIs.
      
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
