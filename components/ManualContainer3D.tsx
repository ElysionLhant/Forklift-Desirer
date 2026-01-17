

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { PackingResult, PlacedItem } from '../types';
import { CONTAINERS } from '../constants';
import { SCALE, FLOOR_HEIGHT, FORKLIFT_LIFT_MARGIN_CM, ANIMATION_DURATION, Box } from './SceneElements';

interface ManualContainer3DProps {
  layout: { result: PackingResult, offset: THREE.Vector3, index: number }[];
}

interface DragState {
    active: boolean;
    startPoint: THREE.Vector3;
    initialPositions: Map<string, {x: number, y: number, z: number}>;
    containerIndex: number;
}

const SelectionHandler: React.FC<{
    layout: { result: PackingResult, offset: THREE.Vector3, index: number }[]; // keeping for types, but we might rely on the new local state approach
    // We will update SelectionHandler to use the current items context if possible, 
    // or arguably selection logic creates the set, and the rest uses it.
    // For manual mode with moving items, selection logic needs current positions.
    // This implies SelectionHandler needs access to the live 'itemsMap'.
    itemsMap: Map<number, PlacedItem[]>;
    selectedIds: Set<string>;
    setSelectedIds: (ids: Set<string>) => void;
}> = ({ itemsMap, layout, selectedIds, setSelectedIds }) => {
    // ... (Old selection logic relied on props.layout using original positions)
    // We need to implement selection based on `itemsMap` to reflect dragged positions.
    
    // Simplification: We will move the selection logic into the main component or 
    // pass the live data to this component.
    return null; 
};

export const ManualContainer3D: React.FC<ManualContainer3DProps> = ({ layout }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ start: {x:number, y:number}, end: {x:number, y:number} } | null>(null);
    
    // Map container index to its items (modifiable state)
    const [itemsMap, setItemsMap] = useState<Map<number, PlacedItem[]>>(new Map());
    
    // Drag State
    const [dragState, setDragState] = useState<DragState>({ active: false, startPoint: new THREE.Vector3(), initialPositions: new Map(), containerIndex: -1 });
    const orbitControlsRef = useRef<any>(null);

    // Initialize items from prop layout
    useEffect(() => {
        const map = new Map<number, PlacedItem[]>();
        layout.forEach(l => {
            // Clone items to avoid mutating props
            map.set(l.index, l.result.placedItems.map(i => ({...i})));
        });
        setItemsMap(map);
    }, [layout]);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    // Ref to track if we are in "Box Drag" mode to prevent Selection Box
    const isBoxDraggingRef = useRef(false);
    const dragStartRef = useRef<{x:number, y:number} | null>(null);

    // Selection Logic Component (Moved inline or kept separate but fed with live data)
    const SelectionLogic = () => {
        const { camera, size } = useThree();
        
        useEffect(() => {
            if (!selectionBox) return; 

            const { start, end } = selectionBox;
            const left = Math.min(start.x, end.x);
            const top = Math.min(start.y, end.y);
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);
            
            if (width < 5 && height < 5) return;

            const newSet = new Set<string>();

            // Iterate over LIVE items
            layout.forEach(({ offset, index }) => {
                const items = itemsMap.get(index) || [];
                items.forEach(item => {
                    const l = item.dimensions.length * SCALE;
                    const w = item.dimensions.width * SCALE;
                    const h = item.dimensions.height * SCALE;

                    const targetLocalX = (item.position.x * SCALE) + (l / 2);
                    const targetLocalY = (item.position.y * SCALE) + FLOOR_HEIGHT; 
                    const targetLocalZ = (item.position.z * SCALE) + (w / 2);
        
                    const worldPos = new THREE.Vector3(
                        targetLocalX + offset.x,
                        targetLocalY + offset.y + h/2,
                        targetLocalZ + offset.z
                    );
                    
                    worldPos.project(camera);
                    const sx = (worldPos.x * .5 + .5) * size.width;
                    const sy = (-(worldPos.y * .5) + .5) * size.height;

                    if (sx >= left && sx <= left + width && sy >= top && sy <= top + height) {
                        newSet.add(item.id);
                    }
                });
            });

            // Update selection.
            // Optimization: check diff
            let change = false;
            if (newSet.size !== selectedIds.size) change = true;
            else {
                for (let id of newSet) if (!selectedIds.has(id)) { change = true; break; }
            }
            if (change) setSelectedIds(newSet);

        }, [selectionBox, itemsMap, camera, size]); 

        return null;
    };

    // ----- Dragging Logic -----

    const handleBoxPointerDown = (e: ThreeEvent<PointerEvent>, containerIndex: number, item: PlacedItem) => {
        if (e.button !== 0) return; // Only trigger on Left Click
        if (e.shiftKey) return; // Allow bubbling for Box Selection (Shift + Drag)

        e.stopPropagation();
        // capture pointer
        (e.target as any).setPointerCapture(e.pointerId);

        // If not selected and no modifier, select only this.
        let newSelection = new Set(selectedIds);
        if (!selectedIds.has(item.id)) {
            if (!e.ctrlKey) newSelection = new Set([item.id]);
            else newSelection.add(item.id);
            setSelectedIds(newSelection);
        } else if (e.ctrlKey) {
            // Deselect logic if already selected and ctrl clicked? 
            // Usually drag starts anyway. Let's keep it simple.
        }

        // Disable OrbitControls
        if (orbitControlsRef.current) orbitControlsRef.current.enabled = false;

        // Prepare initial positions for all dragged items
        const initialPos = new Map<string, {x:number, y:number, z:number}>();
        const items = itemsMap.get(containerIndex) || [];
        items.forEach(it => {
            if (newSelection.has(it.id)) {
                initialPos.set(it.id, { ...it.position });
            }
        });

        setDragState({
            active: true,
            startPoint: e.point.clone(), // The 3D point on the box where we clicked
            initialPositions: initialPos,
            containerIndex
        });
        
        isBoxDraggingRef.current = true;
    };

    const SNAP_THRESHOLD = 5; // cm

    const handleBoxPointerMove = (e: ThreeEvent<PointerEvent>) => {
        if (!dragState.active) return;
        e.stopPropagation();

        const planeY = dragState.startPoint.y;
        const raycaster = e.ray; // Ray from camera
        
        const t = (planeY - raycaster.origin.y) / raycaster.direction.y;
        if (!isFinite(t)) return;
        
        const intersection = new THREE.Vector3().copy(raycaster.origin).add(raycaster.direction.multiplyScalar(t));
        
        const deltaX = intersection.x - dragState.startPoint.x;
        const deltaZ = intersection.z - dragState.startPoint.z;

        let dLocalX = deltaX / SCALE;
        let dLocalZ = deltaZ / SCALE;

        // Snapping logic
        const layoutEntry = layout.find(l => l.index === dragState.containerIndex);
        if (layoutEntry) {
            const spec = CONTAINERS.find(c => c.type === layoutEntry.result.containerType) || CONTAINERS[0];
            const items = itemsMap.get(dragState.containerIndex) || [];
            const stationary = items.filter(it => !dragState.initialPositions.has(it.id));

            // Candidate snap lines
            const snapX = [0, spec.dimensions.length];
            const snapZ = [0, spec.dimensions.width];
            stationary.forEach(s => {
                snapX.push(s.position.x, s.position.x + s.dimensions.length);
                snapZ.push(s.position.z, s.position.z + s.dimensions.width);
            });

            let minDX = SNAP_THRESHOLD;
            let adjustX = 0;
            let minDZ = SNAP_THRESHOLD;
            let adjustZ = 0;

            for (const [id, init] of dragState.initialPositions.entries()) {
                const item = items.find(i => i.id === id);
                if (!item) continue;
                
                const curXMin = init.x + dLocalX;
                const curXMax = curXMin + item.dimensions.length;
                const curZMin = init.z + dLocalZ;
                const curZMax = curZMin + item.dimensions.width;

                for (const sx of snapX) {
                    const d1 = sx - curXMin;
                    if (Math.abs(d1) < minDX) { minDX = Math.abs(d1); adjustX = d1; }
                    const d2 = sx - curXMax;
                    if (Math.abs(d2) < minDX) { minDX = Math.abs(d2); adjustX = d2; }
                }
                for (const sz of snapZ) {
                    const d1 = sz - curZMin;
                    if (Math.abs(d1) < minDZ) { minDZ = Math.abs(d1); adjustZ = d1; }
                    const d2 = sz - curZMax;
                    if (Math.abs(d2) < minDZ) { minDZ = Math.abs(d2); adjustZ = d2; }
                }
            }
            dLocalX += adjustX;
            dLocalZ += adjustZ;
        }

        // Update items with Physics (Climbing) using World Space to allow Inter-Container interaction
        setItemsMap(prev => {
            const newMap = new Map(prev);
            const items = newMap.get(dragState.containerIndex)?.map(it => ({...it})) || [];
            
            // 1. Prepare World Collision Boxes for ALL stationary items across ALL containers
            // We use 'prev' map (which holds current positions) and 'layout' (which holds constant offsets)
            const allStationaryBoxes: { 
                minX: number, maxX: number, 
                minZ: number, maxZ: number, 
                topY: number 
            }[] = [];

            prev.forEach((contItems, cIndex) => {
                 const contLayout = layout.find(l => l.index === cIndex);
                 if(!contLayout) return;
                 const { x: offX, y: offY, z: offZ } = contLayout.offset;

                 contItems.forEach(it => {
                     // Check if this item is the one being moved (globally unique IDs assumed, or at least unique per container)
                     // If dragState.containerIndex == cIndex, we check against initialPositions
                     if (cIndex === dragState.containerIndex && dragState.initialPositions.has(it.id)) return;

                     const l = it.dimensions.length * SCALE;
                     const w = it.dimensions.width * SCALE;
                     const h = it.dimensions.height * SCALE;
                     
                     // Convert to World Logic Space
                     const wx = (it.position.x * SCALE) + offX;
                     const wy = (it.position.y * SCALE) + offY;
                     const wz = (it.position.z * SCALE) + offZ;
                     
                     allStationaryBoxes.push({
                         minX: wx, maxX: wx + l,
                         minZ: wz, maxZ: wz + w,
                         topY: wy + h
                     });
                 });
            });

            // 2. Update X/Z for moved items in the current container
            items.forEach(it => {
                if (dragState.initialPositions.has(it.id)) {
                    const init = dragState.initialPositions.get(it.id)!;
                    it.position.x = init.x + dLocalX;
                    it.position.z = init.z + dLocalZ;
                }
            });

            // 3. Identify and Sort moved items
            const moved = items.filter(it => dragState.initialPositions.has(it.id));
            moved.sort((a, b) => {
                 const initA = dragState.initialPositions.get(a.id)!;
                 const initB = dragState.initialPositions.get(b.id)!;
                 return initA.y - initB.y;
            });

            // 4. Resolve Physics (Stacking/Climbing) in World Space
            const EPSILON = 0.001 * SCALE; 
            
            // Current Container Offset
            const curLayout = layout.find(l => l.index === dragState.containerIndex);
            const curOffX = curLayout?.offset.x || 0;
            const curOffY = curLayout?.offset.y || 0;
            const curOffZ = curLayout?.offset.z || 0;

            for (const item of moved) {
                const l = item.dimensions.length * SCALE;
                const h = item.dimensions.height * SCALE;
                const w = item.dimensions.width * SCALE;

                // Move item to tentative World Position (X/Z updated, Y is floor initially)
                const wMinX = (item.position.x * SCALE) + curOffX;
                const wMaxX = wMinX + l;
                const wMinZ = (item.position.z * SCALE) + curOffZ;
                const wMaxZ = wMinZ + w;
                
                // Base height is the floor of the CURRENT container
                let maxH_World = curOffY; 

                for (const other of allStationaryBoxes) {
                     const intersect = (wMinX < other.maxX - EPSILON && wMaxX > other.minX + EPSILON && 
                                        wMinZ < other.maxZ - EPSILON && wMaxZ > other.minZ + EPSILON);
                     
                     if (intersect) {
                         // Stack on top
                         if (other.topY > maxH_World) maxH_World = other.topY;
                     }
                }
                
                // Convert resolved World Y back to Local Y
                item.position.y = (maxH_World - curOffY) / SCALE;
                
                // Add to stationary boxes (dynamic stacking)
                allStationaryBoxes.push({
                    minX: wMinX, maxX: wMaxX,
                    minZ: wMinZ, maxZ: wMaxZ,
                    topY: maxH_World + h
                });
            }
            
            newMap.set(dragState.containerIndex, items);
            return newMap;
        });
    };

    const handleBoxPointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (!dragState.active) return;
        e.stopPropagation();
        (e.target as any).releasePointerCapture(e.pointerId);

        // Apply Gravity is handled in real-time during move now.
        // We just commit the final state by ending drag.

        setDragState(prev => ({ ...prev, active: false }));
        isBoxDraggingRef.current = false;
        if (orbitControlsRef.current) orbitControlsRef.current.enabled = true;
    };




    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button === 0 && !isBoxDraggingRef.current) { // Left Click and NOT dragging a box
            const rect = canvasContainerRef.current?.getBoundingClientRect();
            if (rect) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                dragStartRef.current = { x, y };
                setSelectionBox({ start: { x, y }, end: { x, y } });
                
                if (!e.ctrlKey) setSelectedIds(new Set());
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (dragStartRef.current && selectionBox && !isBoxDraggingRef.current) {
            const rect = canvasContainerRef.current?.getBoundingClientRect();
            if (rect) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                setSelectionBox({ 
                    start: dragStartRef.current, 
                    end: { x, y } 
                });
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (e.button === 0) {
            // Clean up selection box
            setSelectionBox(null);
            dragStartRef.current = null;
        }
    };

    const toggleSelection = (id: string, multi: boolean) => {
        const newSet = multi ? new Set<string>(selectedIds) : new Set<string>();
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    return (
        <div 
            ref={canvasContainerRef}
            style={{ width: '100%', height: '100%', position: 'relative', userSelect: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {/* Selection Box Overlay */}
            {selectionBox && (
                <div style={{
                    position: 'absolute',
                    border: '1px solid #3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    left: Math.min(selectionBox.start.x, selectionBox.end.x),
                    top: Math.min(selectionBox.start.y, selectionBox.end.y),
                    width: Math.abs(selectionBox.end.x - selectionBox.start.x),
                    height: Math.abs(selectionBox.end.y - selectionBox.start.y),
                    pointerEvents: 'none',
                    zIndex: 10
                }} />
            )}

            <Canvas shadows camera={{ position: [12, 8, 12], fov: 40 }}>
                <color attach="background" args={['#f1f5f9']} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 20, 10]} intensity={1} castShadow shadow-bias={-0.0001} />
                
                <SelectionLogic />

                <group>
                    <gridHelper args={[100, 100, 0x94a3b8, 0xe2e8f0]} position={[0, -0.01, 0]} />
                    {layout.map(({ result, offset, index }) => {
                        const items = itemsMap.get(index) || [];

                        const spec = CONTAINERS.find(c => c.type === result.containerType) || CONTAINERS[0];
                        const l = spec.dimensions.length * SCALE;
                        const w = spec.dimensions.width * SCALE;
                        const h = spec.dimensions.height * SCALE;
                        const marginH = FORKLIFT_LIFT_MARGIN_CM * SCALE;

                        return (
                            <group key={index}>
                                <group position={[offset.x + l/2, offset.y + h/2 + FLOOR_HEIGHT, offset.z + w/2]}>
                                    <lineSegments>
                                        <edgesGeometry args={[new THREE.BoxGeometry(l, h, w)]} />
                                        <lineBasicMaterial color="#475569" linewidth={2} />
                                    </lineSegments>
                                    <mesh position={[0, -h/2 - 0.02, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                                        <planeGeometry args={[l, w]} />
                                        <meshStandardMaterial color="#cbd5e1" />
                                    </mesh>
                                    <mesh position={[0, (h/2) - (marginH/2), 0]}>
                                        <boxGeometry args={[l, marginH, w]} />
                                        <meshBasicMaterial color="#ef4444" transparent opacity={0.15} />
                                    </mesh>
                                </group>
                                <Text position={[offset.x + l/2, offset.y + h + 1.0, offset.z + w/2]} fontSize={0.6} color="#1e293b" rotation={[0, -Math.PI/2, 0]}>
                                    {result.containerType} #{index + 1} (Manual)
                                </Text>
                                {items.map((item, i) => (
                                    <group 
                                        key={item.id} 
                                        onPointerDown={(e) => handleBoxPointerDown(e, index, item)}
                                        onPointerMove={handleBoxPointerMove}
                                        onPointerUp={handleBoxPointerUp}
                                    >
                                        <Box 
                                            item={item}
                                            delay={0} 
                                            containerLength={spec.dimensions.length}
                                            containerWidth={spec.dimensions.width}
                                            animationDuration={ANIMATION_DURATION}
                                            offset={offset}
                                            skipAnimation={true}
                                            isSelected={selectedIds.has(item.id)}
                                        />
                                    </group>
                                ))}
                            </group>
                        );
                    })}
                </group>
                <OrbitControls 
                    ref={orbitControlsRef}
                    makeDefault 
                    minPolarAngle={0} 
                    maxPolarAngle={Math.PI / 2} 
                    mouseButtons={{
                        LEFT: undefined, // Disable default left click
                        MIDDLE: THREE.MOUSE.ROTATE,
                        RIGHT: THREE.MOUSE.PAN
                    }}
                />
            </Canvas>
        </div>
    );
};

