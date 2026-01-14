
import { CargoItem, ContainerSpec, PlacedItem, PackingResult } from '../types';
import { CONTAINERS } from '../constants';

const OPERATION_BUFFER = 2; 
const FORKLIFT_LIFT_MARGIN = 15;

interface BoxToPack {
  id: string;
  cargoId: string;
  dim: { l: number; w: number; h: number };
  wt: number;
  color: string;
  name: string;
  originalItem: CargoItem;
  unstackable?: boolean;
}

interface Anchor {
  x: number;
  y: number;
  z: number;
}

const calculateSupportArea = (
  baseX: number, baseZ: number, baseL: number, baseW: number,
  supportX: number, supportZ: number, supportL: number, supportW: number
): number => {
  const xOverlap = Math.max(0, Math.min(baseX + baseL, supportX + supportL) - Math.max(baseX, supportX));
  const zOverlap = Math.max(0, Math.min(baseZ + baseW, supportZ + supportW) - Math.max(baseZ, supportZ));
  return xOverlap * zOverlap;
};

const canFitThroughDoor = (box: BoxToPack, door: { width: number, height: number }): boolean => {
  const fitsNormal = box.dim.w <= door.width && box.dim.h <= door.height;
  const fitsRotated = box.dim.l <= door.width && box.dim.h <= door.height;
  return fitsNormal || fitsRotated;
};

const checkValidity = (
  pos: { x: number; y: number; z: number },
  dim: { l: number; w: number; h: number },
  containerDim: { l: number; w: number; h: number },
  placedItems: PlacedItem[]
): boolean => {
  if (pos.x + dim.l > containerDim.l) return false;
  const maxStackHeight = containerDim.h - FORKLIFT_LIFT_MARGIN;
  if (pos.y + dim.h > maxStackHeight) return false;
  if (pos.z + dim.w > containerDim.w) return false;

  for (const item of placedItems) {
    const intersectX = pos.x < item.position.x + item.dimensions.length && pos.x + dim.l > item.position.x;
    const intersectY = pos.y < item.position.y + item.dimensions.height && pos.y + dim.h > item.position.y;
    const intersectZ = pos.z < item.position.z + item.dimensions.width && pos.z + dim.w > item.position.z;
    if (intersectX && intersectY && intersectZ) return false;
  }

  if (pos.y > 0) {
      let totalSupportArea = 0;
      const requiredArea = dim.l * dim.w;
      for (const item of placedItems) {
        if (Math.abs((item.position.y + item.dimensions.height) - pos.y) < 0.1) {
           const area = calculateSupportArea(
             pos.x, pos.z, dim.l, dim.w,
             item.position.x, item.position.z, item.dimensions.length, item.dimensions.width
           );
           if (area > 0) {
               if (item.unstackable) return false;
               totalSupportArea += area;
           }
        }
      }
      if ((totalSupportArea / requiredArea) < 0.70) return false;
  }
  return true;
};

const packSingleContainer = (
    containerSpec: ContainerSpec, 
    boxes: BoxToPack[],
    containerIndex: number
): { result: PackingResult, remainingBoxes: BoxToPack[] } => {
    
    const cDim = {
        l: containerSpec.dimensions.length - OPERATION_BUFFER,
        w: containerSpec.dimensions.width - OPERATION_BUFFER,
        h: containerSpec.dimensions.height - OPERATION_BUFFER
    };

    const placedItems: PlacedItem[] = [];
    let anchors: Anchor[] = [{ x: 0, y: 0, z: 0 }];
    const remainingBoxes: BoxToPack[] = [];
    let currentWeight = 0;

    for (const box of boxes) {
        if (currentWeight + box.wt > containerSpec.maxWeight) {
            remainingBoxes.push(box);
            continue;
        }

        if (!canFitThroughDoor(box, containerSpec.doorDimensions)) {
            remainingBoxes.push(box);
            continue;
        }

        let bestAnchorIndex = -1;
        let bestOrientationIsRotated = false;
        let bestScore = Number.MAX_SAFE_INTEGER;

        for (let i = 0; i < anchors.length; i++) {
            const anc = anchors[i];
            if (checkValidity(anc, box.dim, cDim, placedItems)) {
                const score = (anc.x * 100000) + (anc.y * 1000) + anc.z;
                if (score < bestScore) {
                    bestScore = score;
                    bestAnchorIndex = i;
                    bestOrientationIsRotated = false;
                }
            }
            const rotDim = { l: box.dim.w, w: box.dim.l, h: box.dim.h };
            if (checkValidity(anc, rotDim, cDim, placedItems)) {
                const score = (anc.x * 100000) + (anc.y * 1000) + anc.z;
                if (score < bestScore) {
                    bestScore = score;
                    bestAnchorIndex = i;
                    bestOrientationIsRotated = true;
                }
            }
        }

        if (bestAnchorIndex !== -1) {
            const anc = anchors[bestAnchorIndex];
            const finalDim = bestOrientationIsRotated 
                ? { length: box.dim.w, width: box.dim.l, height: box.dim.h }
                : { length: box.dim.l, width: box.dim.w, height: box.dim.h };

            placedItems.push({
                id: `c${containerIndex}-b${placedItems.length}`,
                cargoId: box.cargoId,
                position: { x: anc.x, y: anc.y, z: anc.z },
                dimensions: finalDim,
                rotation: bestOrientationIsRotated,
                color: box.color,
                name: box.name,
                weight: box.wt,
                sequence: placedItems.length + 1,
                containerIndex: containerIndex,
                unstackable: box.unstackable
            });
            currentWeight += box.wt;

            anchors.push({ x: anc.x, y: anc.y + finalDim.height, z: anc.z });
            anchors.push({ x: anc.x, y: anc.y, z: anc.z + finalDim.width });
            anchors.push({ x: anc.x + finalDim.length, y: anc.y, z: anc.z });
            anchors.sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.z - b.z));
            anchors = anchors.filter(a => a.x < cDim.l && a.y < (cDim.h - FORKLIFT_LIFT_MARGIN) && a.z < cDim.w);
        } else {
            remainingBoxes.push(box);
        }
    }

    const usedVolume = placedItems.reduce((acc, item) => acc + (item.dimensions.length * item.dimensions.width * item.dimensions.height), 0) / 1000000;

    return {
        result: {
            containerType: containerSpec.type,
            placedItems,
            unplacedItems: [], 
            totalVolume: containerSpec.volume,
            usedVolume,
            volumeUtilization: (usedVolume / containerSpec.volume) * 100,
            totalWeight: currentWeight,
            weightUtilization: (currentWeight / containerSpec.maxWeight) * 100,
            totalCargoCount: placedItems.length,
        },
        remainingBoxes
    };
};

export const calculateShipment = (
  strategy: 'SMART_MIX' | ContainerSpec | ContainerSpec[],
  cargoItems: CargoItem[]
): PackingResult[] => {
  
  let boxesToPack: BoxToPack[] = [];
  cargoItems.forEach(item => {
    for (let i = 0; i < item.quantity; i++) {
      boxesToPack.push({
        id: `${item.id}-${i}`,
        cargoId: item.id,
        dim: { l: item.dimensions.length, w: item.dimensions.width, h: item.dimensions.height },
        wt: item.weight,
        color: item.color,
        name: item.name,
        originalItem: item,
        unstackable: item.unstackable
      });
    }
  });

  boxesToPack.sort((a, b) => (b.dim.h - a.dim.h) || (b.dim.l * b.dim.w - a.dim.l * a.dim.w));

  const shipmentResults: PackingResult[] = [];
  let containerCount = 0;
  
  const spec20GP = CONTAINERS.find(c => c.type === '20GP')!;
  const spec40GP = CONTAINERS.find(c => c.type === '40GP')!;
  const spec40HQ = CONTAINERS.find(c => c.type === '40HQ')!;

  if (Array.isArray(strategy)) {
      for (const spec of strategy) {
          if (boxesToPack.length === 0) break;
          containerCount++;
          const { result, remainingBoxes } = packSingleContainer(spec, boxesToPack, containerCount);
          shipmentResults.push(result);
          boxesToPack = remainingBoxes;
      }
  } else if (strategy !== 'SMART_MIX') {
      while (boxesToPack.length > 0) {
          containerCount++;
          const { result, remainingBoxes } = packSingleContainer(strategy, boxesToPack, containerCount);
          shipmentResults.push(result);
          boxesToPack = remainingBoxes;
          if (result.placedItems.length === 0) break;
      }
  } else {
      // SMART_MIX: Hierarchical Efficiency (20GP < 40GP < 40HQ)
      while (boxesToPack.length > 0) {
          containerCount++;
          
          const sim20 = packSingleContainer(spec20GP, boxesToPack, containerCount);
          
          // 1. If 20GP completes all remaining cargo, use it (cheapest).
          if (sim20.remainingBoxes.length === 0) {
              shipmentResults.push(sim20.result);
              boxesToPack = [];
              break;
          }

          const sim40GP = packSingleContainer(spec40GP, boxesToPack, containerCount);
          const sim40HQ = packSingleContainer(spec40HQ, boxesToPack, containerCount);

          // 2. Determine best move between 40GP and 40HQ
          // Hierarchy: 40GP is "cheaper" than 40HQ. We only use 40HQ if it fits significantly more or 40GP fails.
          if (sim40HQ.remainingBoxes.length < sim40GP.remainingBoxes.length || sim40HQ.result.volumeUtilization > sim40GP.result.volumeUtilization + 5) {
              shipmentResults.push(sim40HQ.result);
              boxesToPack = sim40HQ.remainingBoxes;
          } else {
              shipmentResults.push(sim40GP.result);
              boxesToPack = sim40GP.remainingBoxes;
          }
          
          if (shipmentResults[shipmentResults.length - 1].placedItems.length === 0) break;
      }
  }

  return shipmentResults;
};
