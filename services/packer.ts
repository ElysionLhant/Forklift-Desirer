
import { CargoItem, ContainerSpec, PlacedItem, PackingResult } from '../types';
import { CONTAINERS } from '../constants';
import { projectDebugger } from './debugger';

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

// Z-Banding constants for scoring
const Z_ZONE_SIZE = 150; // 1.5m deep zones for terracing
const SUPPORT_THRESHOLD = 0.85; // Require 85% support for stability

// Sorting Heuristics
const MIN_AREA_DIFF_FOR_SORT = 50; // cm2 difference to consider one item "Larger" than another
const MIN_QTY_DIFF_FOR_SORT = 10;  // Quantity difference to prioritize bulk items

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

// Returns the total area of items directly supporting appropriate surface
const CheckSupportBelow = (
    boxX: number, boxY: number, boxZ: number, 
    boxL: number, boxW: number, 
    placedItems: PlacedItem[]
): { supportedArea: number, maxSupportBaseArea: number } => {
    if (boxY === 0) return { supportedArea: boxL * boxW, maxSupportBaseArea: 999999 };

    let supportedArea = 0;
    let maxBaseArea = 0;

    placedItems.forEach(item => {
        // Check if item is directly below (allowing small tolerance)
        const itemTop = item.position.y + item.dimensions.height;
        if (Math.abs(itemTop - boxY) < 1.0) {
            const overlap = calculateSupportArea(
                boxX, boxZ, boxL, boxW,
                item.position.x, item.position.z, item.dimensions.length, item.dimensions.width
            );
            if (overlap > 0) {
                supportedArea += overlap;
                const itemBaseArea = item.dimensions.length * item.dimensions.width;
                if (itemBaseArea > maxBaseArea) maxBaseArea = itemBaseArea;
            }
        }
    });
    return { supportedArea, maxSupportBaseArea: maxBaseArea };
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

const packSingleContainerAsync = async (
    containerSpec: ContainerSpec, 
    boxes: BoxToPack[],
    containerIndex: number
): Promise<{ result: PackingResult, remainingBoxes: BoxToPack[] }> => {
    
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

    // ADHESION_BONUS: Bonus for placing item next to same type.
    // Score unit is approx 1 = 1cm Z.
    // 600 = 6 meters preference (Too high, causes gaps to be ignored).
    // Reduced to 50 (50cm) to allow filling significant gaps with different items.
    const ADHESION_BONUS = 50;  
    const FLUSH_BONUS = 200; // Bonus for aligning height with neighbors ("Shoulder to Shoulder")

    // PRE-CALCULATION / LOOKAHEAD
    // Analyze the unstackable items to understand what kind of "Headroom" we need to preserve.
    const unstackableItems = candidatePool.filter(b => b.unstackable);
    const unstackableHeights = [...new Set(unstackableItems.map(b => b.dim.h))].sort((a,b) => b-a); // Descending
    const maxUnstackableH = unstackableHeights.length > 0 ? unstackableHeights[0] : 0;
    const minUnstackableH = unstackableHeights.length > 0 ? unstackableHeights[unstackableHeights.length - 1] : 0;
    
    // We want to form layers that leave exactly enough space for these items.
    // e.g. if Container is 270cm, and Unstackable is 80cm, we want a platform at 190cm.
    const targetPlatformLevels = unstackableHeights.map(h => cDim.h - h);

    projectDebugger.log('Packer', `Starting container #${containerIndex} (${containerSpec.type})`, {
        boxCount: candidatePool.length,
        unstackableCount: unstackableItems.length,
        unstackableHeights,
        targetPlatformLevels
    });

    // Helper to optimize position by sliding left (decreasing Z)
    const optimizeZ = (startPos: {x: number, y: number, z: number}, dim: {l: number, w: number, h: number}) => {
        // Fix for "Staircase" / Offset issue:
        // If we are stacking on top of something (y > 0), we should strictly align with the support item below (the anchor source).
        // Sliding Z while stacking causes overhangs because checkValidity allows ~30% overhang.
        // We want perfect stacking alignment.
        if (startPos.y > 0.1) return startPos.z;

        let optimizedZ = startPos.z;
        const step = 1.0; // Reduced from 5.0 to 1.0 to find small gaps for Copper Profiles
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

    const isFlushWithNeighbors = (pos: {x: number, y: number, z: number}, dim: {l: number, w: number, h: number}) => {
        const myTop = pos.y + dim.h;
        const PROXIMITY = 1.0;
        
        for (const item of placedItems) {
            const itemTop = item.position.y + item.dimensions.height;
            if (Math.abs(itemTop - myTop) > 0.5) continue; // Not flush vertically
            
            const itemMinX = item.position.x;
            const itemMaxX = item.position.x + item.dimensions.length;
            const itemMinZ = item.position.z;
            const itemMaxZ = item.position.z + item.dimensions.width;

            // Check horizontal overlap to confirm they are "side-by-side"
            const xOverlap = Math.max(0, Math.min(pos.x + dim.l, itemMaxX) - Math.max(pos.x, itemMinX));
            const zOverlap = Math.max(0, Math.min(pos.z + dim.w, itemMaxZ) - Math.max(pos.z, itemMinZ));
            
            // Neighbors along X axis: Share Z range AND X-distance < PROXIMITY
            const neighborX = (zOverlap > 0.1) && (Math.abs(pos.x - itemMaxX) < PROXIMITY || Math.abs(itemMinX - (pos.x + dim.l)) < PROXIMITY);

            // Neighbors along Z axis: Share X range AND Z-distance < PROXIMITY
            const neighborZ = (xOverlap > 0.1) && (Math.abs(pos.z - itemMaxZ) < PROXIMITY || Math.abs(itemMinZ - (pos.z + dim.w)) < PROXIMITY);

            if (neighborX || neighborZ) return true;
        }
        return false;
    };

    // Main Loop: Iterate until no more boxes can be placed
    let loopCounter = 0;
    while (candidatePool.length > 0) {
        loopCounter++;
        if (loopCounter % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));

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
                    // BASE SCORE:
                    // Primary: Minimize X (Fill Back to Front)
                    // Secondary: Minimize Y (Fill Floor to Ceiling) -> changed logic below
                    // Tertiary: Minimize Z (Fill Right to Left)
                    let score = (anc.x * 10000) + (anc.y * 10) + optZ;
                    
                    // Helper: logic to score unstackables
                    if (box.unstackable) {
                         // Removed the massive floor penalty (100M).
                         // We rely on the "Gap Strategy" to penalize floor placement 
                         // only if it implies wasting vertical space (topGap > 40).
                         
                         // GAP STRATEGY FOR UNSTACKABLES
                         // We only want to place unstackables near the top to avoid wasting vertical space.
                         const topGap = cDim.h - (anc.y + box.dim.h);
                         
                         if (topGap > 40) {
                             // If placing this leaves a huge gap (e.g. at bottom of stack), PENALIZE IT.
                             // We want to force the packer to build stacks higher with stackable items first.
                             score += 1000000;
                         } else {
                             // We are near the top. Encourage placing unstackables here!
                             score -= 500000;
                         }
                    } else {
                        // STACKABLE STRATEGY
                        // Removed hardcoded name checks. 
                        // We rely on "Big-First" sorting and "Support-Check" to ensure Heavy/Large items 
                        // settle to the bottom and stable positions naturally.

                        if (anc.x < cDim.l * 0.5) score -= 5000;

                        // PROGRESSIVE STACKING PENALTY (Slope Effect)
                        // Use Z-Banding (Terracing) to allow flat tops while still favoring low-front.
                        const zZone = Math.floor(anc.z / Z_ZONE_SIZE);
                        score += (zZone * anc.y * 50.0); // Stepwise penalty

                        const currentTopY = anc.y + box.dim.h;
                        const gapRemaining = cDim.h - currentTopY;

                        // 3. PHYSICAL STABILITY CHECK
                        // Ensure we are not placing a big item on a small item
                        if (anc.y > 0) {
                            const { supportedArea, maxSupportBaseArea } = CheckSupportBelow(
                                finalPos.x, finalPos.y, finalPos.z, 
                                box.dim.l, box.dim.w, 
                                placedItems
                            );
                            
                            const myArea = box.dim.l * box.dim.w;
                            // Penalize if we overhang significantly (support < 85%)
                            if (supportedArea < myArea * SUPPORT_THRESHOLD) {
                                score += 500000; 
                            }
                            // Penalize STRONGLY if we are sitting on something vastly smaller (Unstable base)
                            // e.g. Big Orange (area 4000) on Small Red (area 2700)
                            if (maxSupportBaseArea < myArea * 0.9) {
                                score += 200000; // Force it to find a better base (like floor)
                            }
                        }

                        // 1. LOOKAHEAD: Check if we are landing on a "Perfect Platform"
                        const isGoodPlatform = targetPlatformLevels.some(lvl => Math.abs(lvl - currentTopY) < 5);
                        if (isGoodPlatform) {
                            score -= 20000; 
                        }

                        // 2. LOOKAHEAD: Kill-Zone Penalty
                        if (minUnstackableH > 0 && gapRemaining < minUnstackableH && gapRemaining > 5) {
                            score += 100000; 
                        }
                    }

                    // Adhesion
                    if (hasSameTypeNeighbor(finalPos, box.dim, box.cargoId)) {
                        score -= ADHESION_BONUS;
                    }

                    // Flush Bonus (Shoulder-to-Shoulder)
                    if (isFlushWithNeighbors(finalPos, box.dim)) {
                        score -= FLUSH_BONUS; 
                    }

                    if (score < bestScore) {
                        // Debug Log for significant moves
                        if (box.unstackable || score < -10000) {
                            projectDebugger.debug('Packer', `New Best (Norm): ${box.name} at y=${anc.y}`, { score, topGap: cDim.h - (anc.y + box.dim.h) });
                        }
                        
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

// Smart Scoring (Rotated)
                    let score = (anc.x * 10000) + (anc.y * 10) + optZ;
                    
                    if (box.unstackable) {
                         const topGap = cDim.h - (anc.y + rotDim.h);
                         if (topGap > 40) {
                             score += 1000000; // Don't cap stacks early
                         } else {
                             score -= 500000; // Prefer top slots
                         }
                    } else {
                        // STACKABLE SCORING
                        // Removed hardcoded name checks.

                        if (anc.x < cDim.l * 0.5) score -= 5000; // Prefer Back
                        
                        // PROGRESSIVE STACKING PENALTY (Slope Effect) - Rotated
                        const zZone = Math.floor(finalPos.z / Z_ZONE_SIZE);
                        score += (zZone * anc.y * 50.0);

                        const currentTopY = anc.y + rotDim.h;
                        const gapRemaining = cDim.h - currentTopY;

                        // 3. PHYSICAL STABILITY CHECK (Rotated)
                        if (anc.y > 0) {
                            const { supportedArea, maxSupportBaseArea } = CheckSupportBelow(
                                finalPos.x, finalPos.y, finalPos.z, 
                                rotDim.l, rotDim.w, 
                                placedItems
                            );
                            
                            const myArea = rotDim.l * rotDim.w;
                            if (supportedArea < myArea * SUPPORT_THRESHOLD) {
                                score += 500000;
                            }
                            if (maxSupportBaseArea < myArea * 0.9) {
                                score += 200000;
                            }
                        }

                        // 1. LOOKAHEAD: Check if we are landing on a "Perfect Platform" for an unstackable
                        // If currentTopY matches a target platform level (within tolerance), Bonus!
                        const isGoodPlatform = targetPlatformLevels.some(lvl => Math.abs(lvl - currentTopY) < 5);
                        if (isGoodPlatform) {
                            score -= 20000; // Good job, you prepared a spot for a Red box
                        }

                        // 2. LOOKAHEAD: Check if we are "Killing" a potential spot
                        // If we create a gap that is TOO SMALL for the smallest unstackable (but not filled), penalty.
                        if (minUnstackableH > 0 && gapRemaining < minUnstackableH && gapRemaining > 5) {
                            score += 100000; // You are creating unusable trash space! Stop!
                        }
                    }

                    if (hasSameTypeNeighbor(finalPos, rotDim, box.cargoId)) {
                        score -= ADHESION_BONUS;
                    }

                    // Flush Bonus (Shoulder-to-Shoulder)
                    if (isFlushWithNeighbors(finalPos, rotDim)) {
                        score -= FLUSH_BONUS;
                    }

                    if (score < bestScore) {
                         // Debug Log for significant moves
                        if (box.unstackable || score < -10000) {
                            projectDebugger.debug('Packer', `New Best (Rot): ${box.name} at y=${anc.y}`, { score, topGap: cDim.h - (anc.y + rotDim.h) });
                        }

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

export const calculateShipmentAsync = async (
  strategy: 'SMART_MIX' | ContainerSpec | ContainerSpec[],
  cargoItems: CargoItem[],
  onProgress?: (message: string, progress: number) => void
): Promise<PackingResult[]> => {
  
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
      // 1. Sort by Stackability: Stackables First
      //    We need to build the "Base" first, then place "Caps" (Unstackables) on top.
      if (a.unstackable !== b.unstackable) {
          return a.unstackable ? 1 : -1;
      }

      // 2. Sort by Base Area Descending (Big footprint items go to the BACK/DEEP)
      //    "Big as base" -> Use large items to form stable layers.
      const areaA = a.dim.w * a.dim.l;
      const areaB = b.dim.w * b.dim.l;
      if (Math.abs(areaA - areaB) > MIN_AREA_DIFF_FOR_SORT) {
          return areaB - areaA; // DESCENDING
      }

      // 3. Sort by Quantity Descending
      //    (Within same footprint, pack the Bulk items before Small lots)
      if (Math.abs(b.originalItem.quantity - a.originalItem.quantity) > MIN_QTY_DIFF_FOR_SORT) {
          return b.originalItem.quantity - a.originalItem.quantity;
      }

      // 4. Sort by Weight Descending
      //    (Within same footprint/qty, put Heavy on Bottom)
      return b.wt - a.wt;
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
          if (onProgress) onProgress(`Packing container ${containerCount} (${spec.type})...`, 0);
          const { result, remainingBoxes } = await packSingleContainerAsync(spec, boxesToPack, containerCount);
          shipmentResults.push(result);
          boxesToPack = remainingBoxes;
      }
  } else if (strategy !== 'SMART_MIX') {
      while (boxesToPack.length > 0) {
          containerCount++;
          if (onProgress) onProgress(`Packing container ${containerCount}...`, 0);
          const { result, remainingBoxes } = await packSingleContainerAsync(strategy, boxesToPack, containerCount);
          shipmentResults.push(result);
          boxesToPack = remainingBoxes;
          if (result.placedItems.length === 0) break;
      }
  } else {
      while (boxesToPack.length > 0) {
          containerCount++;
          if (onProgress) onProgress(`Simulating permutations for Container ${containerCount}...`, 0);

          // 1. Try 20GP first if remaining volume is low
          const test20 = await packSingleContainerAsync(spec20GP, boxesToPack, containerCount);
          if (test20.remainingBoxes.length === 0) {
              shipmentResults.push(test20.result);
              boxesToPack = [];
              break;
          }

          // 2. Determine if HQ is mandatory for height (> 222cm)
          const hasExtraTallCargo = boxesToPack.some(b => b.dim.h > (spec40GP.dimensions.height - OPERATION_BUFFER - FORKLIFT_LIFT_MARGIN));
          
          if (hasExtraTallCargo) {
              const { result, remainingBoxes } = await packSingleContainerAsync(spec40HQ, boxesToPack, containerCount);
              shipmentResults.push(result);
              boxesToPack = remainingBoxes;
          } else {
              // 3. Compare 40GP and 40HQ efficiency
              const simGP = await packSingleContainerAsync(spec40GP, boxesToPack, containerCount);
              const simHQ = await packSingleContainerAsync(spec40HQ, boxesToPack, containerCount);

              // Calculate Packing Counts
              const countGP = simGP.result.placedItems.length;
              const countHQ = simHQ.result.placedItems.length;
              
              const hqRemains = simHQ.remainingBoxes.length;
              const gpRemains = simGP.remainingBoxes.length;

              // Decision Logic: Always prefer 40HQ if it packs strictly MORE items.
              // This ensures we fully utilize the vertical space (top layer) of the HQ whenever possible.
              const hqPacksMore = countHQ > countGP;
              const hqCompletes = hqRemains === 0 && gpRemains > 0;
              const hqVolumeBetter = simHQ.result.usedVolume > simGP.result.usedVolume;

              // If counts are equal, use HQ only if it completes the manifest (unlikely if counts equal) or has significantly better volume usage (tighter pack?)
              // Generally if counts are equal, use GP (Cheaper).
              
              if (hqCompletes || hqPacksMore) {
                  shipmentResults.push(simHQ.result);
                  boxesToPack = simHQ.remainingBoxes;
              } else if (countHQ === countGP && hqVolumeBetter && (simHQ.result.usedVolume - simGP.result.usedVolume) > 2.0) {
                   // Tie-breaker: If same count, but HQ uses 2m^3 more volume (bigger items packed?), take HQ.
                   shipmentResults.push(simHQ.result);
                   boxesToPack = simHQ.remainingBoxes;
              } else {
                  shipmentResults.push(simGP.result);
                  boxesToPack = simGP.remainingBoxes; 
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
