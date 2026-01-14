
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
  containerType: '20GP' | '40GP' | '40HQ';
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

export type AIProvider = 'gemini' | 'openai' | 'ollama' | 'lmstudio';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  modelName: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  modelName: 'gemini-3-flash-preview',
};
