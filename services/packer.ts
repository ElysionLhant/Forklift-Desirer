import { CargoItem, ContainerSpec, PlacedItem, PackingResult } from '../types';
import { CONTAINERS } from '../constants';

// 运行公差/缓冲 (cm)
const OPERATION_BUFFER = 2; 

interface BoxToPack {
  id: string; // 内部唯一ID
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

/**
 * 校验货物是否能物理通过集装箱门洞
 * 货物进入时通常是长度方向(L)平行于集装箱长度，因此需要校验 W 和 H 是否小于门洞
 */
const canFitThroughDoor = (box: BoxToPack, door: { width: number, height: number }): boolean => {
  // 检查原始方向是否能过门
  const fitsNormal = box.dim.w <= door.width && box.dim.h <= door.height;
  // 检查旋转90度后是否能过门 (交换宽和高的情况通常不现实，因为重力，但这里支持 W/L 交换)
  // 如果是 L/W 交换进入：
  const fitsRotated = box.dim.l <= door.width && box.dim.h <= door.height;
  
  return fitsNormal || fitsRotated;
};

const checkValidity = (
  pos: { x: number; y: number; z: number },
  dim: { l: number; w: number; h: number },
  containerDim: { l: number; w: number; h: number },
  placedItems: PlacedItem[]
): boolean => {
  // 1. 边界检查
  if (pos.x + dim.l > containerDim.l) return false;
  if (pos.y + dim.h > containerDim.h) return false;
  if (pos.z + dim.w > containerDim.w) return false;

  // 2. 静态碰撞检查
  for (const item of placedItems) {
    const intersectX = pos.x < item.position.x + item.dimensions.length && pos.x + dim.l > item.position.x;
    const intersectY = pos.y < item.position.y + item.dimensions.height && pos.y + dim.h > item.position.y;
    const intersectZ = pos.z < item.position.z + item.dimensions.width && pos.z + dim.w > item.position.z;
    if (intersectX && intersectY && intersectZ) return false;
  }

  // 3. 支撑检查
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

  // 4. 路径通达度检查 (叉车装载路径)
  const pathStartX = pos.x + dim.l;
  const epsilon = 0.5;

  for (const item of placedItems) {
      if (item.position.x + item.dimensions.length <= pathStartX - epsilon) continue;
      const zOverlap = Math.max(0, Math.min(pos.z + dim.w, item.position.z + item.dimensions.width) - Math.max(pos.z, item.position.z));
      const yOverlap = Math.max(0, Math.min(pos.y + dim.h, item.position.y + item.dimensions.height) - Math.max(pos.y, item.position.y));
      if (zOverlap > 5 && yOverlap > 5) return false;
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
        // A. 重量校验
        if (currentWeight + box.wt > containerSpec.maxWeight) {
            remainingBoxes.push(box);
            continue;
        }

        // B. 门洞尺寸校验 (核心逻辑更新)
        if (!canFitThroughDoor(box, containerSpec.doorDimensions)) {
            console.warn(`Item ${box.name} is too large for the door of ${containerSpec.type}`);
            remainingBoxes.push(box);
            continue;
        }

        let bestAnchorIndex = -1;
        let bestOrientationIsRotated = false;
        let bestScore = Number.MAX_SAFE_INTEGER;

        for (let i = 0; i < anchors.length; i++) {
            const anc = anchors[i];
            
            // 方向 A: 原始 L, W
            if (checkValidity(anc, box.dim, cDim, placedItems)) {
                const score = (anc.x * 100000) + (anc.y * 1000) + anc.z;
                if (score < bestScore) {
                    bestScore = score;
                    bestAnchorIndex = i;
                    bestOrientationIsRotated = false;
                }
            }
            
            // 方向 B: 交换 L, W (旋转)
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

            // 生成新锚点
            anchors.push({ x: anc.x, y: anc.y + finalDim.height, z: anc.z });
            anchors.push({ x: anc.x, y: anc.y, z: anc.z + finalDim.width });
            anchors.push({ x: anc.x + finalDim.length, y: anc.y, z: anc.z });

            anchors.sort((a, b) => {
                 if (Math.abs(a.x - b.x) > 1) return a.x - b.x;
                 if (Math.abs(a.y - b.y) > 1) return a.y - b.y;
                 return a.z - b.z;
            });
            
            anchors = anchors.filter(a => 
                a.x < cDim.l && a.y < cDim.h && a.z < cDim.w &&
                !placedItems.some(item => 
                    a.x >= item.position.x && a.x < item.position.x + item.dimensions.length &&
                    a.y >= item.position.y && a.y < item.position.y + item.dimensions.height &&
                    a.z >= item.position.z && a.z < item.position.z + item.dimensions.width
                )
            );
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
            totalCargoCount: placedItems.length
        },
        remainingBoxes
    };
};

export const calculateShipment = (
  strategy: 'SMART_MIX' | ContainerSpec | ContainerSpec[],
  cargoItems: CargoItem[],
  maxContainers?: number
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

  boxesToPack.sort((a, b) => {
    if (b.dim.h !== a.dim.h) return b.dim.h - a.dim.h;
    if (b.dim.w !== a.dim.w) return b.dim.w - a.dim.w;
    return b.dim.l - a.dim.l;
  });

  const shipmentResults: PackingResult[] = [];
  let containerCount = 0;
  
  if (Array.isArray(strategy)) {
      for (const spec of strategy) {
          if (boxesToPack.length === 0) break;
          containerCount++;
          const { result, remainingBoxes } = packSingleContainer(spec, boxesToPack, containerCount);
          shipmentResults.push(result);
          boxesToPack = remainingBoxes;
      }
      return finishShipment(shipmentResults, boxesToPack);
  }

  const containerLimit = maxContainers || 999;
  const spec40HQ = CONTAINERS.find(c => c.type === '40HQ')!;
  const spec40GP = CONTAINERS.find(c => c.type === '40GP')!;
  const spec20GP = CONTAINERS.find(c => c.type === '20GP')!;
  
  const primarySpec = strategy === 'SMART_MIX' ? spec40HQ : strategy;

  while (boxesToPack.length > 0 && containerCount < containerLimit) {
    containerCount++;
    let activeSpec = primarySpec;

    if (strategy === 'SMART_MIX') {
        const packHQ = packSingleContainer(spec40HQ, boxesToPack, containerCount);
        if (packHQ.remainingBoxes.length === 0) {
            const pack20 = packSingleContainer(spec20GP, boxesToPack, containerCount);
            if (pack20.remainingBoxes.length === 0) activeSpec = spec20GP; 
            else {
                 const pack40 = packSingleContainer(spec40GP, boxesToPack, containerCount);
                 if (pack40.remainingBoxes.length === 0) activeSpec = spec40GP;
                 else activeSpec = spec40HQ;
            }
        } else activeSpec = spec40HQ;
    }

    const { result, remainingBoxes } = packSingleContainer(activeSpec, boxesToPack, containerCount);
    shipmentResults.push(result);
    boxesToPack = remainingBoxes;

    if (result.placedItems.length === 0 && boxesToPack.length > 0) boxesToPack.shift(); 
  }

  return finishShipment(shipmentResults, boxesToPack);
};

const finishShipment = (results: PackingResult[], unplaced: BoxToPack[]): PackingResult[] => {
    if (unplaced.length > 0 && results.length > 0) {
        const map = new Map<string, CargoItem>();
        unplaced.forEach(b => {
            if (map.has(b.cargoId)) map.get(b.cargoId)!.quantity++;
            else map.set(b.cargoId, { ...b.originalItem, quantity: 1 });
        });
        results[results.length - 1].unplacedItems = Array.from(map.values());
    }
    return results;
};
