import { ContainerSpec } from './types';

// Internal Dimensions in cm
// UPDATED: Using "Practical Safe Loading Dimensions" based on logistics experience.
// Theoretical 40ft is ~1203cm, but safe loading length is usually 1180-1190cm to ensure door closure.
// Theoretical 20ft is ~589cm, safe loading length is ~580cm.
export const CONTAINERS: ContainerSpec[] = [
  {
    type: '20GP',
    name: '20ft General Purpose',
    dimensions: { length: 580, width: 235, height: 239 }, // Conservative safe limit
    doorDimensions: { width: 234, height: 228 },
    maxWeight: 28000,
    volume: 33.1,
    basePrice: 1200,
  },
  {
    type: '40GP',
    name: '40ft General Purpose',
    dimensions: { length: 1185, width: 235, height: 239 }, // Conservative safe limit (approx 4-6 inches buffer)
    doorDimensions: { width: 234, height: 228 },
    maxWeight: 28000,
    volume: 67.5,
    basePrice: 2000,
  },
  {
    type: '40HQ',
    name: '40ft High Cube',
    dimensions: { length: 1185, width: 235, height: 269 }, // Conservative safe limit
    doorDimensions: { width: 234, height: 258 },
    maxWeight: 28500,
    volume: 76.1,
    basePrice: 2400,
  },
];

export const MOCK_CARGO_COLORS = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
];
