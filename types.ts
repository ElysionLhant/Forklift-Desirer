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
  unstackable?: boolean; // New property
}

export interface ContainerSpec {
  type: '20GP' | '40GP' | '40HQ';
  name: string;
  dimensions: Dimensions; // Internal dimensions
  doorDimensions: { width: number; height: number }; // Door opening dimensions
  maxWeight: number; // kg
  volume: number; // m3
  basePrice: number; // Estimated freight cost for demo
}

export interface PlacedItem {
  id: string; // unique placement id
  cargoId: string;
  position: { x: number; y: number; z: number }; // Top-left-front corner relative to container origin
  dimensions: Dimensions; // Actual orientation dimensions
  rotation: boolean; // true if rotated 90 deg on Y axis
  color: string;
  name: string;
  weight: number;
  sequence: number; // Loading order
  containerIndex: number; // Explicitly track which container index this item belongs to
  unstackable?: boolean; // New property to track placement constraints
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

// --- AI CONFIGURATION TYPES ---

export type AIProvider = 'gemini' | 'openai' | 'ollama' | 'lmstudio';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string; // For Local/OpenAI
  modelName: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '', // User must provide or use env
  modelName: 'gemini-2.0-flash',
};
