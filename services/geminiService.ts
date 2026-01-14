
import { GoogleGenAI } from "@google/genai";
import { CargoItem, PackingResult, AIConfig, ChatMsg } from "../types";

const systemPrompt = `
You are a Senior Logistics Advisor for "Forklift Desirer".
Your mission: Help users maximize container utilization and recommend the most cost-effective container plan.

COST HIERARCHY RULES:
- 20GP is the LEAST expensive container.
- 40GP is more expensive than 20GP.
- 40HQ is the MOST expensive container.
- Goal: Minimize total cost by prioritizing smaller/fewer containers where physically possible.

CORE CONSTRAINTS:
- Functional Height Limit = Container Height - 17cm (2cm buffer + 15cm forklift lift clearance).
- 20GP/40GP loading limit: ~222cm height.
- 40HQ loading limit: ~252cm height.

AI CAPABILITIES:
1. EXTRACT cargo dimensions/qty from input text or images.
2. RECOMMEND container types (favoring 20GP over 40GP/HQ if it fits).

STRICT FORBIDDEN ACTIONS:
- DO NOT provide specific price quotes ($/€/¥ etc).
- DO NOT use currency symbols.
- DO NOT calculate shipping costs in numbers.
- ONLY speak in terms of "efficiency", "minimizing container count", and "hierarchical priority" (20GP < 40GP < 40HQ).

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

Assume 15cm of clearance is ALWAYS needed at the top for forklift operations.
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

  async sendMessage(history: ChatMsg[], context?: { cargoItems: CargoItem[], result: PackingResult, containerName: string }): Promise<string> {
    let contextStr = "";
    if (context) {
        const summary = context.cargoItems.map(c => `- ${c.name}: ${c.quantity}x (${c.dimensions.length}x${c.dimensions.width}x${c.dimensions.height})cm`).join('\n');
        contextStr = `Current Plan: ${context.containerName}\nUtilization: ${context.result.volumeUtilization.toFixed(1)}%\nManifest:\n${summary}`;
    }
    const latestMsg = history[history.length - 1];
    if (this.config.provider === 'gemini') return this.sendToGemini(latestMsg, contextStr);
    return "Provider not implemented.";
  }

  private async sendToGemini(msg: ChatMsg, contextStr: string): Promise<string> {
      if (!process.env.API_KEY) return "API Key missing.";
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];
      if (msg.attachments) {
          for (const att of msg.attachments) {
               if (att.base64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: att.base64.split(',')[1] } });
          }
      }
      parts.push({ text: `${contextStr}\n\nUser: ${msg.text}` });
      try {
          const response = await ai.models.generateContent({
              model: this.config.modelName || 'gemini-3-flash-preview',
              contents: { parts },
              config: { systemInstruction: systemPrompt }
          });
          return response.text || "No response.";
      } catch (err: any) { return `Error: ${err.message}`; }
  }
}
