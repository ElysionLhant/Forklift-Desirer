
import { CargoItem, ContainerSpec, PlacedItem, PackingResult } from '../types';
import { CONTAINERS } from '../constants';

const OPERATION_BUFFER = 2; 
const FORKLIFT_LIFT_MARGIN = 15;

// Forklift spec in cm (consistent with Container3D)
const FORKLIFT_OH_GUARD_HEIGHT = 210; // Overhead guard height often defines clearance. 
// Container3D uses: chassisHeight 1.4m, mastHeight 1.6m. 
// Standard container forklift often < 2.2m. 20GP door is 228cm.
// Let's use the visual values from Container3D for collision consistency.
const FORKLIFT_WIDTH = 110; // Standard forklift width (e.g. Toyota 8-Series is ~107-115cm)
const FORKLIFT_MAST_HEIGHT = 160;   // The vertical part that might hit things
const FORKLIFT_CHASSIS_HEIGHT = 140; // The body
const WALL_BUFFER = 2; // Minimal buffer for walls (simulating skilled operation)

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

const checkForkliftAccess = (
  targetPos: { x: number; y: number; z: number },
  boxDim: { l: number; w: number; h: number },
  containerDim: { l: number; w: number; h: number },
  placedItems: PlacedItem[]
): boolean => {
    // If placing on top of something (Y > 0), check if we can reach the STACK BASE
    // We assume forklift lifts from the aisle, then pushes/shifts onto the stack.
    // The critical check is: Can the forklift chassis reach the position required to deposit this item?
    // For high stacking, the chassis stays on the ground, but the mast must have clearance.
    
    // Simplification: We only simulate Ground Access for the Chassis.
    // If placing at Y=100, the chassis is at Y=0. The path must be clear at Y=0.
    
    // ... existing logic checks path at ground level ...

    const boxCenterZ = targetPos.z + (boxDim.w / 2);
    const halfChassisW = FORKLIFT_WIDTH / 2;
    // Increased shift capability to model expert operators capable of tight maneuvers
    const SIDE_SHIFT = 60; 

    // Wall constraints
    // Center must be within [halfChassisW + Buffer, Width - halfChassisW - Buffer]
    const minWallZ = halfChassisW + WALL_BUFFER;
    const maxWallZ = containerDim.w - halfChassisW - WALL_BUFFER;

    // Reach constraints
    // Chassis center must be close enough to box center
    const minReachZ = boxCenterZ - SIDE_SHIFT;
    const maxReachZ = boxCenterZ + SIDE_SHIFT;

    // Intersection to find initial valid range
    // We check [minStart, maxStart]
    let validMinZ = Math.max(minWallZ, minReachZ);
    let validMaxZ = Math.min(maxWallZ, maxReachZ);
    
    // Valid Interval Logic
    // If we are placing very high up (e.g. above 200cm), the mast is maximally extended.
    // For standard container operations, we assume if the chassis can reach the X-position, 
    // and the immediate stacking column is clear, the operator can maneuver the mast.
    // So we primarily check for CHASSIS collisions at Y=0.
    
    // If even with shifting we hit walls or can't reach, it's invalid
    if (validMinZ > validMaxZ + 0.01) return false; 

    // 2. Filter Candidate Range against Obstacles in the Path
    // Path: from box face (startX) to Door (endX)
    // We strictly check for obstacles at CHASSIS HEIGHT (Y < 140cm).
    // Items placed higher than 140cm do not block the chassis path.
    const startX = targetPos.x + boxDim.l;
    const endX = containerDim.l;
    
    // We maintain a list of valid intervals for the chassis center Z.
    // Initially just one interval: [validMinZ, validMaxZ]
    let validIntervals: {min: number, max: number}[] = [{ min: validMinZ, max: validMaxZ }];

    for (const item of placedItems) {
        // Optimization: If item is high up, it doesn't block the chassis driving on the floor
        if (item.position.y > FORKLIFT_CHASSIS_HEIGHT) continue;

        // Broad Phase: If item is completely behind the path (closer to wall than startX), ignore
        if (item.position.x + item.dimensions.length <= startX) continue;
        // If item is completely outside the door (impossible but safe), ignore
        if (item.position.x >= endX) continue;

        // X Overlap Check
        const itemMinX = item.position.x;
        const itemMaxX = item.position.x + item.dimensions.length;
        // Check if item is in the path corridor [startX, endX]
        const xOverlap = Math.max(0, Math.min(endX, itemMaxX) - Math.max(startX, itemMinX));
        if (xOverlap <= 0.1) continue; 
        
        // Y Overlap Check
        // Forklift mass occupies 0 to FORKLIFT_MAST_HEIGHT
        const itemMinY = item.position.y;
        const itemMaxY = item.position.y + item.dimensions.height;
        const yOverlap = Math.max(0, Math.min(FORKLIFT_MAST_HEIGHT, itemMaxY) - Math.max(0, itemMinY));
        if (yOverlap <= 0.1) continue;

        // This item is an obstacle in the X-Path.
        // It blocks any chassis Z-position where the chassis body overlaps the item.
        // Item Z Range: [itemMinZ, itemMaxZ]
        // Chassis (width W) at center C covers [C - W/2, C + W/2].
        // Collision if [C - W/2, C + W/2] overlaps [itemMinZ, itemMaxZ].
        // Rewrite as: Forbidden C Range = [itemMinZ - W/2, itemMaxZ + W/2]
        
        const itemMinZ = item.position.z;
        const itemMaxZ = item.position.z + item.dimensions.width;
        
        const forbiddenMin = itemMinZ - halfChassisW; // Expanded by chassis radius
        const forbiddenMax = itemMaxZ + halfChassisW;

        // Subtract forbidden range from validIntervals
        const nextIntervals: {min: number, max: number}[] = [];
        for (const interval of validIntervals) {
             // Case 1: Forbidden covers entire interval -> Remove interval completely
             if (forbiddenMin <= interval.min && forbiddenMax >= interval.max) continue;
             
             // Case 2: No overlap -> Keep interval as is
             if (forbiddenMax <= interval.min || forbiddenMin >= interval.max) {
                 nextIntervals.push(interval);
                 continue;
             }
             
             // Case 3: Partial overlap - Split
             // If forbidden bites into the middle?
             // Left remaining part
             if (forbiddenMin > interval.min) {
                 nextIntervals.push({ min: interval.min, max: forbiddenMin });
             }
             // Right remaining part
             if (forbiddenMax < interval.max) {
                 nextIntervals.push({ min: forbiddenMax, max: interval.max });
             }
        }
        validIntervals = nextIntervals;
        
        // Optimization: If no valid intervals left, we can stop early
        if (validIntervals.length === 0) return false;
    }
    
    // If any interval remains, simulation says "Yes, there is a path!"
    return validIntervals.length > 0;
};

const checkValidity = (
  pos: { x: number; y: number; z: number },
  dim: { l: number; w: number; h: number },
  containerDim: { l: number; w: number; h: number },
  placedItems: PlacedItem[]
): boolean => {
  if (pos.x + dim.l > containerDim.l) return false;
  
  // Height check: Must leave 15cm for forklift operation
  const maxStackHeight = containerDim.h - FORKLIFT_LIFT_MARGIN;
  if (pos.y + dim.h > maxStackHeight) return false;
  
  if (pos.z + dim.w > containerDim.w) return false;

  for (const item of placedItems) {
    const intersectX = pos.x < item.position.x + item.dimensions.length && pos.x + dim.l > item.position.x;
    const intersectY = pos.y < item.position.y + item.dimensions.height && pos.y + dim.h > item.position.y;
    const intersectZ = pos.z < item.position.z + item.dimensions.width && pos.z + dim.w > item.position.z;
    if (intersectX && intersectY && intersectZ) return false;
  }

  // Check if forklift can technically reach this position without collision
  if (!checkForkliftAccess(pos, dim, containerDim, placedItems)) return false;

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
    
    // Change to Best-Fit: Maintain a candidate pool
    const candidatePool = [...boxes];
    let currentWeight = 0;

    const ADHESION_BONUS = 600; 

    // Helper to optimize position by sliding left (decreasing Z)
    const optimizeZ = (startPos: {x: number, y: number, z: number}, dim: {l: number, w: number, h: number}) => {
        // Fix for "Staircase" / Offset issue:
        // If we are stacking on top of something (y > 0), we should strictly align with the support item below (the anchor source).
        // Sliding Z while stacking causes overhangs because checkValidity allows ~30% overhang.
        // We want perfect stacking alignment.
        if (startPos.y > 0.1) return startPos.z;

        let optimizedZ = startPos.z;
        const step = 0.5; // High precision for tight stacking
        while (optimizedZ - step >= 0) {
             const testPos = { ...startPos, z: optimizedZ - step };
             if (checkValidity(testPos, dim, cDim, placedItems)) {
                 optimizedZ -= step;
             } else {
                 break;
             }
        }
        return optimizedZ;
    };

    const hasSameTypeNeighbor = (pos: {x: number, y: number, z: number}, dim: {l: number, w: number, h: number}, cId: string) => {
        // Check for proximity (within 1cm) to any placed item with same Cargo ID
        const PROXIMITY = 1.0;
        const bounds = {
            minX: pos.x - PROXIMITY, maxX: pos.x + dim.l + PROXIMITY,
            minY: pos.y - PROXIMITY, maxY: pos.y + dim.h + PROXIMITY,
            minZ: pos.z - PROXIMITY, maxZ: pos.z + dim.w + PROXIMITY
        };
        
        for (const item of placedItems) {
            if (item.cargoId !== cId) continue;
            
            const itemMinX = item.position.x;
            const itemMaxX = item.position.x + item.dimensions.length;
            const itemMinY = item.position.y;
            const itemMaxY = item.position.y + item.dimensions.height;
            const itemMinZ = item.position.z;
            const itemMaxZ = item.position.z + item.dimensions.width;

            if (bounds.minX < itemMaxX && bounds.maxX > itemMinX &&
                bounds.minY < itemMaxY && bounds.maxY > itemMinY &&
                bounds.minZ < itemMaxZ && bounds.maxZ > itemMinZ) {
                return true;
            }
        }
        return false;
    };

    // Main Loop: Iterate until no more boxes can be placed
    while (candidatePool.length > 0) {
        let bestMove: {
            boxIndex: number;
            anchorIndex: number;
            isRotated: boolean;
            score: number;
            pos: { x: number; y: number; z: number };
        } | null = null;
        let bestScore = Number.MAX_SAFE_INTEGER;

        // Optimization: Deduplicate checks for identical items.
        // Instead of checking all 1000 items, we only check the first instance of each unique cargoId.
        const indicesToCheck: number[] = [];
        const typesChecked = new Set<string>();
        for (let i = 0; i < candidatePool.length; i++) {
            if (!typesChecked.has(candidatePool[i].cargoId)) {
                typesChecked.add(candidatePool[i].cargoId);
                indicesToCheck.push(i);
            }
        }

        // Try to place representatives of each unique item type on EVERY anchor
        for (const b of indicesToCheck) {
            const box = candidatePool[b];

            if (currentWeight + box.wt > containerSpec.maxWeight) continue;
            if (!canFitThroughDoor(box, containerSpec.doorDimensions)) continue;

            for (let a = 0; a < anchors.length; a++) {
                const anc = anchors[a];

                // 1. Check Normal Orientation
                if (checkValidity(anc, box.dim, cDim, placedItems)) {
                    const optZ = optimizeZ(anc, box.dim);
                    const finalPos = { x: anc.x, y: anc.y, z: optZ };
                    
                    // Smart Scoring
                    let score = (anc.x * 100000) + (anc.y * 1000) + optZ;
                    
                    // PENALTY: Unstackable on Floor
                    // We strongly discourage placing unstackable items on the ground if they can go on top of something.
                    if (anc.y === 0 && box.unstackable) score += 1000000;
                    
                    // REMOVED BONUS: Unstackable on Ceiling
                    // Previously we gave -20000 bonus, which caused unstackables to "jump the queue" and cap stacks prematurely.
                    // By removing this, we rely on the SORT ORDER (Stackables First).
                    // This ensures Red boxes stack as high as possible (Red on Red on Red) before an Unstackable is finally placed on top.

                    // Adhesion
                    if (hasSameTypeNeighbor(finalPos, box.dim, box.cargoId)) {
                        score -= ADHESION_BONUS;
                    }

                    if (score < bestScore) {
                        bestScore = score;
                        bestMove = {
                            boxIndex: b,
                            anchorIndex: a,
                            isRotated: false,
                            score: score,
                            pos: finalPos
                        };
                    }
                }

                // 2. Check Rotated Orientation
                const rotDim = { l: box.dim.w, w: box.dim.l, h: box.dim.h };
                if (checkValidity(anc, rotDim, cDim, placedItems)) {
                    const optZ = optimizeZ(anc, rotDim);
                    const finalPos = { x: anc.x, y: anc.y, z: optZ };

                    let score = (anc.x * 100000) + (anc.y * 1000) + optZ;
                    if (anc.y === 0 && box.unstackable) score += 1000000;
                    // if (anc.y > 0 && box.unstackable) score -= 20000; // Removed to prevent premature capping
                    
                    if (hasSameTypeNeighbor(finalPos, rotDim, box.cargoId)) {
                        score -= ADHESION_BONUS;
                    }

                    if (score < bestScore) {
                        bestScore = score;
                        bestMove = {
                            boxIndex: b,
                            anchorIndex: a,
                            isRotated: true,
                            score: score,
                            pos: finalPos
                        };
                    }
                }
            }
        }

        if (bestMove) {
            const box = candidatePool[bestMove.boxIndex];
            const finalDim = bestMove.isRotated 
                ? { length: box.dim.w, width: box.dim.l, height: box.dim.h }
                : { length: box.dim.l, width: box.dim.w, height: box.dim.h };
            
            const finalPos = bestMove.pos;

            placedItems.push({
                id: `c${containerIndex}-b${placedItems.length}`,
                cargoId: box.cargoId,
                position: { x: finalPos.x, y: finalPos.y, z: finalPos.z },
                dimensions: finalDim,
                rotation: bestMove.isRotated,
                color: box.color,
                name: box.name,
                weight: box.wt,
                sequence: placedItems.length + 1,
                containerIndex: containerIndex,
                unstackable: box.unstackable
            });
            currentWeight += box.wt;

            // Remove box from pool
            candidatePool.splice(bestMove.boxIndex, 1);

            // Update Anchors
            anchors.push({ x: finalPos.x, y: finalPos.y + finalDim.height, z: finalPos.z });
            anchors.push({ x: finalPos.x, y: finalPos.y, z: finalPos.z + finalDim.width });
            anchors.push({ x: finalPos.x + finalDim.length, y: finalPos.y, z: finalPos.z });

            anchors.sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.z - b.z));
            anchors = anchors.filter(a => a.x < cDim.l && a.y < (cDim.h - FORKLIFT_LIFT_MARGIN) && a.z < cDim.w);
        } else {
            // No valid move found for ANY box
            break;
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
        remainingBoxes: candidatePool
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

  boxesToPack.sort((a, b) => {
      // Priority 1: Stackable items first (False=0 < True=1)
      if (a.unstackable !== b.unstackable) {
          return (a.unstackable ? 1 : 0) - (b.unstackable ? 1 : 0);
      }
      // Priority 2: Height Descending (Taller items dictate layer height)
      if (Math.abs(b.dim.h - a.dim.h) > 0.1) {
          return b.dim.h - a.dim.h;
      }
      // Priority 3: Base Area Descending (Stable base)
      return (b.dim.l * b.dim.w) - (a.dim.l * a.dim.w);
  });

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
      while (boxesToPack.length > 0) {
          containerCount++;
          
          // 1. Try 20GP first if remaining volume is low
          const test20 = packSingleContainer(spec20GP, boxesToPack, containerCount);
          if (test20.remainingBoxes.length === 0) {
              shipmentResults.push(test20.result);
              boxesToPack = [];
              break;
          }

          // 2. Determine if HQ is mandatory for height (> 222cm)
          const hasExtraTallCargo = boxesToPack.some(b => b.dim.h > (spec40GP.dimensions.height - OPERATION_BUFFER - FORKLIFT_LIFT_MARGIN));
          
          if (hasExtraTallCargo) {
              const { result, remainingBoxes } = packSingleContainer(spec40HQ, boxesToPack, containerCount);
              shipmentResults.push(result);
              boxesToPack = remainingBoxes;
          } else {
              // 3. Compare 40GP and 40HQ efficiency
              const simGP = packSingleContainer(spec40GP, boxesToPack, containerCount);
              const simHQ = packSingleContainer(spec40HQ, boxesToPack, containerCount);

              // Calculate Packing Gain (Count based, but could be Volume based)
              const countGP = simGP.result.placedItems.length;
              const countHQ = simHQ.result.placedItems.length;
              
              // Key Fix: Calculate advantage relative to what GP achieved, NOT total boxes in queue.
              // If GP packs 100 items and HQ packs 110, advantage is 10%.
              // Previously, if queue was 1000, we calculated 10/1000 = 1%, failing to recognize the gain.
              const hqEfficiencyGain = countGP > 0 ? (countHQ - countGP) / countGP : 1.0;

              // Check if HQ completes the entire remainder while GP fails
              const hqCompletesRemainder = simHQ.remainingBoxes.length === 0 && simGP.remainingBoxes.length > 0;

              // Decision Threshold:
              // 40HQ has ~13% more internal volume than 40GP.
              // If we gain > 5% more cargo, it's usually worth the small price premium to reduce total container count.
              if (hqCompletesRemainder || hqEfficiencyGain > 0.05) {
                  shipmentResults.push(simHQ.result);
                  boxesToPack = simHQ.remainingBoxes;
              } else {
                  shipmentResults.push(simGP.result);
                  boxesToPack = simGP.remainingBoxes; // Corrected: was using simGP which is correct, but let's be explicit
              }
          }
          
          if (shipmentResults[shipmentResults.length - 1].placedItems.length === 0) break;
      }
  }

  if (boxesToPack.length > 0 && shipmentResults.length > 0) {
      const map = new Map<string, CargoItem>();
      boxesToPack.forEach(b => {
          if (map.has(b.cargoId)) map.get(b.cargoId)!.quantity++;
          else map.set(b.cargoId, { ...b.originalItem, quantity: 1 });
      });
      shipmentResults[shipmentResults.length - 1].unplacedItems = Array.from(map.values());
  }

  return shipmentResults.filter(r => r.placedItems.length > 0);
};
