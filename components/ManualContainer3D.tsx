

import React, { useState, useRef, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { PackingResult } from '../types';
import { CONTAINERS } from '../constants';
import { SCALE, FLOOR_HEIGHT, FORKLIFT_LIFT_MARGIN_CM, ANIMATION_DURATION, Box } from './SceneElements';

interface ManualContainer3DProps {
  layout: { result: PackingResult, offset: THREE.Vector3, index: number }[];
}

const SelectionHandler: React.FC<{
    layout: { result: PackingResult, offset: THREE.Vector3, index: number }[];
    selectedIds: Set<string>;
    setSelectedIds: (ids: Set<string>) => void;
}> = ({ layout, selectedIds, setSelectedIds }) => {
    const { camera, gl, scene, size } = useThree();
    const [isSelecting, setIsSelecting] = useState(false);
    const [startPoint, setStartPoint] = useState<{ x: number, y: number } | null>(null);
    const [endPoint, setEndPoint] = useState<{ x: number, y: number } | null>(null);
    const selectionRef = useRef<HTMLDivElement>(null);

    // Helper to get screen position of an object
    const getScreenPosition = (position: THREE.Vector3) => {
        const Vector = position.clone();
        Vector.project(camera);
        const x = (Vector.x * .5 + .5) * size.width;
        const y = (-(Vector.y * .5) + .5) * size.height;
        return { x, y };
    };
    
    // Frustum Selection Logic (Center Point Approximation for simplicity and performance)
    const selectItems = (start: {x: number, y: number}, end: {x: number, y: number}, multiSelect: boolean) => {
        const left = Math.min(start.x, end.x);
        const top = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        
        const newSelection = multiSelect ? new Set(selectedIds) : new Set<string>();
        
        // Single click check (very small box)
        if (width < 5 && height < 5) {
             // Let internal raycaster handle click if needed, but here we do 2D rect logic.
             // If drag is tiny, maybe user meant to click. 
             // We return and let handling occur via other means if preferable, 
             // but here we can try to find 'closest' or 'under cursor'.
             // Raycasting is better for single click.
             return; 
        }

        layout.forEach(({ result, offset }) => {
            result.placedItems.forEach(item => {
                const l = item.dimensions.length * SCALE;
                const w = item.dimensions.width * SCALE;
                const h = item.dimensions.height * SCALE;

                // Calculate center world position
                const targetLocalX = (item.position.x * SCALE) + (l / 2);
                const targetLocalY = (item.position.y * SCALE) + FLOOR_HEIGHT; 
                const targetLocalZ = (item.position.z * SCALE) + (w / 2);
    
                const worldX = targetLocalX + offset.x;
                const worldY = targetLocalY + offset.y + h/2; // Center of box Y
                const worldZ = targetLocalZ + offset.z;
                
                const screenPos = getScreenPosition(new THREE.Vector3(worldX, worldY, worldZ));

                // Check if screenPos is within selection rect
                if (
                    screenPos.x >= left && 
                    screenPos.x <= left + width && 
                    screenPos.y >= top && 
                    screenPos.y <= top + height
                ) {
                    newSelection.add(item.id);
                }
            });
        });
        setSelectedIds(newSelection);
    };

    // Global event listeners attached to the canvas parent would be ideal, 
    // but putting them on the Canvas itself (via r3f events) or a overlay div works.
    // We will use a separate overlay DIV for handling the selection box drawing.
    return null; 
};

export const ManualContainer3D: React.FC<ManualContainer3DProps> = ({ layout }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ start: {x:number, y:number}, end: {x:number, y:number} } | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef<{x:number, y:number} | null>(null);

    // We can't easily use calculating projection inside the React Layout without access to Camera.
    // So we pass logic to a component inside Canvas, but control events from outside.
    // Or we use `calculateSelection` inside a `useThree` component but trigger it from state.
    
    // Better Approach:
    // Handle events on the wrapper div.
    // Pass the selection coordinates to a formatted component inside Canvas that does the calculation.
    
    const SelectionLogic = () => {
        const { camera, size } = useThree();
        
        useFrame(() => {
            if (isDraggingRef.current && dragStartRef.current && selectionBox) {
                 // Real-time update logic if heavy optimization is needed, otherwise do onPointerUp
            }
        });

        // Expose a method or effect to calculate final selection
        React.useEffect(() => {
            if (!selectionBox) return; // Only run when box exists/updates (during drag or end)
            // We only want to commit selection on Drag End typically, or filter live.
            // Let's implement 'live' highlighting if performance allows, or just 'final' on separate event?
            // User asked for "like Windows frame selection". Windows shows selection updating live.
            
            const { start, end } = selectionBox;
            const left = Math.min(start.x, end.x);
            const top = Math.min(start.y, end.y);
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);
            
            // Skip tiny boxes (clicks)
            if (width < 5 && height < 5) return;

            const newSet = new Set<string>();

            layout.forEach(({ result, offset }) => {
                result.placedItems.forEach(item => {
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
                    
                    // Project
                    worldPos.project(camera);
                    const sx = (worldPos.x * .5 + .5) * size.width;
                    const sy = (-(worldPos.y * .5) + .5) * size.height;

                    if (sx >= left && sx <= left + width && sy >= top && sy <= top + height) {
                        newSet.add(item.id);
                    }
                });
            });
            // Update parent state - careful with re-renders loop!
            // We are inside Canvas. `setSelectedIds` is from parent scope.
            // To avoid infinite loop, only update if different.
            // Actually, we can just defer this to 'onPointerUp' logic by calling a function passed down?
            // But we don't have access to Camera outside.
            // So we simply update selection on every frame if dragging?
            if (isDraggingRef.current) {
                 // Check equality to avoid re-render spam
                 let changed = false;
                 if (newSet.size !== selectedIds.size) changed = true;
                 else {
                     for (let id of newSet) if (!selectedIds.has(id)) { changed = true; break; }
                 }
                 if (changed) setSelectedIds(newSet);
            }

        }, [selectionBox]); 

        return null;
    };


    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button === 0) { // Left Click
            isDraggingRef.current = true;
            const rect = canvasContainerRef.current?.getBoundingClientRect();
            if (rect) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                dragStartRef.current = { x, y };
                setSelectionBox({ start: { x, y }, end: { x, y } });
                
                // Clear selection if not holding Ctrl/Shift (not implemented now, assuming clear)
                setSelectedIds(new Set());
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDraggingRef.current && dragStartRef.current) {
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
            isDraggingRef.current = false;
            
            // Should verify if it was a click or drag
            if (selectionBox) {
                 const { start, end } = selectionBox;
                 const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
                 if (dist < 5) {
                    setSelectionBox(null);
                    // It was a click. Raycasting logic handles via onClick on mesh,
                    // BUT OrbitControls might block or we want consistent logic.
                    // For now, let's rely on Box onClick for single item toggle if simpler.
                 } else {
                     setSelectionBox(null);
                     // Selection logic already ran in effect and updated `selectedIds`.
                 }
            }
            dragStartRef.current = null;
        }
    };
    
    // Single item selection handler (for clicks)
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
                                {result.placedItems.map((item, i) => (
                                    <group 
                                        key={item.id} 
                                        onClick={(e) => {
                                            // Only trigger if not dragging
                                           if (!isDraggingRef.current) {
                                               e.stopPropagation();
                                               toggleSelection(item.id, e.ctrlKey);
                                           }
                                        }}
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

