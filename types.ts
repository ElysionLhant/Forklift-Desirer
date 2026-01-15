
// Dimensions are in cm, Weight in kg
export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

export interface CargoItem {
  id: string;
  name: string;
  dimensions: Dimensions;
  weight: number;
  color: string;
  quantity: number;
  unstackable?: boolean;
  /** Lower number = Packed First (Deepest in container) */
  groupPriority?: number;
}

export interface ContainerSpec {
  type: '20GP' | '40GP' | '40HQ';
  name: string;
  dimensions: Dimensions;
  doorDimensions: { width: number; height: number };
  maxWeight: number;
  volume: number;
}

export interface PlacedItem {
  id: string;
  cargoId: string;
  position: { x: number; y: number; z: number };
  dimensions: Dimensions;
  rotation: boolean;
  color: string;
  name: string;
  weight: number;
  sequence: number;
  containerIndex: number;
  unstackable?: boolean;
}

export interface PackingResult {
  containerType: string;
  placedItems: PlacedItem[];
  unplacedItems: CargoItem[];
  totalVolume: number;
  usedVolume: number;
  volumeUtilization: number;
  totalWeight: number;
  weightUtilization: number;
  totalCargoCount: number;
}

export interface ChatMsg {
  role: 'user' | 'model';
  text: string;
  attachments?: { type: 'image' | 'file'; url: string; base64?: string }[];
  isError?: boolean;
}

export type AIProvider = 'openai' | 'ollama' | 'lmstudio'; // Removed explicit 'gemini' as it can be used via openai compatible or just deprecated

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  modelName: string;
}

// Updated default model to a local-first approach
export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://localhost:11434',
  modelName: 'llama3',
};

export interface ChatSession {
    id: string;
    title: string;
    timestamp: number;
    messages: ChatMsg[];
}
