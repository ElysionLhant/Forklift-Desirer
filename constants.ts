
import { ContainerSpec } from './types';

// Internal Dimensions in cm
export const CONTAINERS: ContainerSpec[] = [
  {
    type: '20GP',
    name: '20ft General Purpose',
    dimensions: { length: 580, width: 235, height: 239 },
    doorDimensions: { width: 234, height: 228 },
    maxWeight: 28000,
    volume: 33.1,
  },
  {
    type: '40GP',
    name: '40ft General Purpose',
    dimensions: { length: 1185, width: 235, height: 239 },
    doorDimensions: { width: 234, height: 228 },
    maxWeight: 28000,
    volume: 67.5,
  },
  {
    type: '40HQ',
    name: '40ft High Cube',
    dimensions: { length: 1185, width: 235, height: 269 },
    doorDimensions: { width: 234, height: 258 },
    maxWeight: 28500,
    volume: 76.1,
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
