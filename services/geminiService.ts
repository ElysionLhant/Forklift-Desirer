
import { GoogleGenAI } from "@google/genai";
import { CargoItem, PackingResult, AIConfig, ChatMsg } from "../types";

// --- HELPERS ---

const systemPrompt = `
You are a Senior Logistics Consultant for "Forklift Desirer".
Your capabilities:
1. Analyze container loading plans.
2. EXTRACT cargo details from images (invoices, packing lists) or text descriptions.

CRITICAL: When the user provides a packing list or cargo description, you MUST output the data in this EXACT JSON format inside a markdown code block:

\`\`\`json
[
  { "name": "Item Name", "qty": 10, "l": 100, "w": 50, "h": 50, "weight": 20 }
]
\`\`\`

Rules for Extraction:
- If dimensions are missing, Estimate them based on the item name (standard pallet=120x100x100).
- If weight is missing, Estimate it or default to 10kg.
- "qty" is Quantity. "l","w","h" are cm. "weight" is kg.
`;

export const extractCargoJSON = (text: string): any[] | null => {
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error("Failed to parse extracted JSON", e);
    }
  }
  return null;
};

// --- GENERIC ADAPTER ---

export class AIService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  async sendMessage(
    history: ChatMsg[], 
    context?: { cargoItems: CargoItem[], result: PackingResult, containerName: string }
  ): Promise<string> {
    
    // Construct Context String
    let contextStr = "";
    if (context) {
        const cargoSummary = context.cargoItems.map(c => 
          `- ${c.name}: ${c.quantity} pcs, ${c.dimensions.length}x${c.dimensions.width}x${c.dimensions.height}cm`
        ).join('\n');
        
        contextStr = `
        CURRENT LOAD CONTEXT:
        - Container Strategy: ${context.containerName}
        - Util: ${context.result.volumeUtilization.toFixed(1)}% Vol, ${context.result.weightUtilization.toFixed(1)}% Wt
        - Cargo Manifest:
        ${cargoSummary}
        `;
    }

    const latestMsg = history[history.length - 1];
    
    if (this.config.provider === 'gemini') {
        return this.sendToGemini(latestMsg, contextStr);
    } else {
        return this.sendToOpenAICompat(latestMsg, contextStr);
    }
  }

  // --- GEMINI IMPLEMENTATION ---
  private async sendToGemini(msg: ChatMsg, contextStr: string): Promise<string> {
      if (!process.env.API_KEY) return "Error: Gemini API Key is missing in environment variables.";
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const parts: any[] = [];
      
      if (msg.attachments) {
          for (const att of msg.attachments) {
               if (att.base64) {
                   // Remove data url header
                   const base64Data = att.base64.split(',')[1];
                   parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Data } });
               }
          }
      }
      
      parts.push({ text: contextStr + "\n\nUser Query: " + msg.text });

      try {
          const response = await ai.models.generateContent({
              model: this.config.modelName || 'gemini-2.0-flash',
              contents: { role: 'user', parts },
              config: { systemInstruction: systemPrompt }
          });
          return response.text || "No response text.";
      } catch (err: any) {
          console.error("Gemini Error", err);
          return `Gemini API Error: ${err.message}`;
      }
  }

  // --- OPENAI / OLLAMA / LOCAL IMPLEMENTATION ---
  private async sendToOpenAICompat(msg: ChatMsg, contextStr: string): Promise<string> {
      const url = `${this.config.baseUrl || 'http://localhost:11434'}/v1/chat/completions`;
      
      const content: any[] = [{ type: 'text', text: contextStr + "\n\n" + msg.text }];
      
      if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
               content.push({
                   type: 'image_url',
                   image_url: {
                       url: att.base64 // OpenAI supports data URLs
                   }
               });
          }
      }

      const payload = {
          model: this.config.modelName || 'gpt-4o',
          messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: content }
          ],
          stream: false
      };

      try {
          const res = await fetch(url, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.config.apiKey || 'dummy'}`
              },
              body: JSON.stringify(payload)
          });
          
          if (!res.ok) {
              const errTxt = await res.text();
              return `Provider Error (${res.status}): ${errTxt}`;
          }
          
          const data = await res.json();
          return data.choices?.[0]?.message?.content || "No content returned.";
      } catch (err: any) {
          return `Connection Error: ${err.message}. Ensure your local server (Ollama/LM Studio) is running and accessible.`;
      }
  }
}
