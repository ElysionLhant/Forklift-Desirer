
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Html } from '@react-three/drei';
import { MousePointer2, Copy } from 'lucide-react';
import * as THREE from 'three';
import { PlacedItem, ContainerSpec, PackingResult } from '../types';
import { CONTAINERS } from '../constants';
import { SCALE, FLOOR_HEIGHT, FORKLIFT_LIFT_MARGIN_CM, ANIMATION_DURATION, ANIMATION_GAP, Box } from './SceneElements';
import { ManualContainer3D } from './ManualContainer3D';

interface Container3DProps {
  container: ContainerSpec;
  results: PackingResult[];
  viewMode: 'single' | 'all';
  currentIndex: number;
  skipAnimation: boolean;
}


const HoverTooltip: React.FC<{
    result: PackingResult;
    index: number;
    visible: boolean;
}> = ({ result, index, visible }) => {
    if (!visible) return null;

    return (
        <div className="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-xl border border-gray-200 min-w-[240px] pointer-events-none select-none text-left">
            <h4 className="font-bold text-gray-800 border-b border-gray-100 pb-2 mb-2 flex items-center justify-between">
                <span>{result.containerType} #{index + 1}</span>
            </h4>
            <div className="space-y-1.5 text-xs text-gray-600">
               <div className="grid grid-cols-2 gap-x-4">
                   <span className="text-gray-400">Total Items:</span>
                   <span className="font-medium text-gray-800 text-right">{result.placedItems.length}</span>
               </div>
               <div className="grid grid-cols-2 gap-x-4">
                   <span className="text-gray-400">Volume:</span>
                   <span className="font-medium text-gray-800 text-right">{result.usedVolume.toFixed(2)} m³</span>
               </div>
               <div className="grid grid-cols-2 gap-x-4">
                   <span className="text-gray-400">Weight:</span>
                   <span className="font-medium text-gray-800 text-right">{result.totalWeight} kg</span>
               </div>
            </div>
            
            <div className="mt-3 pt-2 border-t border-gray-100">
                <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Manifest</p>
                <div className="max-h-[100px] overflow-hidden relative">
                    {Object.entries(result.placedItems.reduce((acc, item) => {
                        acc[item.name] = (acc[item.name] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>)).slice(0, 5).map(([name, count]) => (
                        <div key={name} className="flex justify-between text-xs my-0.5">
                            <span className="truncate pr-2">{name}</span>
                            <span className="font-medium text-gray-700">x{count}</span>
                        </div>
                    ))}
                    {Object.keys(result.placedItems.reduce((acc, item) => {
                         acc[item.name] = (acc[item.name] || 0) + 1;
                         return acc;
                    }, {} as Record<string, number>)).length > 5 && (
                        <div className="text-[10px] text-gray-400 mt-1 italic">...and more</div>
                    )}
                </div>
            </div>

            <div className="mt-2 text-[10px] text-indigo-500 flex items-center justify-center bg-indigo-50 py-1 rounded">
                <Copy className="w-3 h-3 mr-1" /> Press Ctrl+C to copy
            </div>
        </div>
    );
};

export const Container3D: React.FC<Container3DProps> = ({ container, results, viewMode, currentIndex, skipAnimation }) => {
    const layout = useMemo(() => {
        const items: { result: PackingResult, offset: THREE.Vector3, index: number }[] = [];
        if (viewMode === 'single') {
            if (results[currentIndex]) items.push({ result: results[currentIndex], offset: new THREE.Vector3(0,0,0), index: currentIndex });
        } else {
            let currentZ = 0;
            results.forEach((res, i) => {
                const spec = CONTAINERS.find(c => c.type === res.containerType) || CONTAINERS[0];
                const width = spec.dimensions.width * SCALE;
                items.push({ result: res, offset: new THREE.Vector3(0, 0, currentZ), index: i });
                currentZ += width + 2.0; 
            });
        }
        return items;
    }, [results, viewMode, currentIndex]);

    const [manualMode, setManualMode] = useState(false);
    const [manualLayout, setManualLayout] = useState<{ result: PackingResult, offset: THREE.Vector3, index: number }[] | null>(null);
    const [animationFinished, setAnimationFinished] = useState(false);
    
    // Tooltip State
    const [hoveredContainer, setHoveredContainer] = useState<number | null>(null);
    const [tooltipVisibleIndex, setTooltipVisibleIndex] = useState<number | null>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    
    // Ctrl+C Capture
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && tooltipVisibleIndex !== null) {
                const entry = layout.find(l => l.index === tooltipVisibleIndex);
                if (entry) {
                    const r = entry.result;
                    const summary = Object.entries(r.placedItems.reduce((acc, item) => {
                        acc[item.name] = (acc[item.name] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>)).map(([n, c]) => `- ${n}: x${c}`).join('\n');

                    const text = `Container: ${r.containerType} #${tooltipVisibleIndex + 1}\n` +
                                 `Total Items: ${r.placedItems.length}\n` +
                                 `Volume: ${r.usedVolume.toFixed(2)} m3 / ${r.totalVolume} m3 (${r.volumeUtilization.toFixed(1)}%)\n` +
                                 `Weight: ${r.totalWeight} kg\n\n` +
                                 `Manifest:\n${summary}`;
                    navigator.clipboard.writeText(text);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tooltipVisibleIndex, layout]);

    const handleContainerHoverEnter = (index: number) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoveredContainer(index);
        
        hoverTimerRef.current = setTimeout(() => {
            setTooltipVisibleIndex(index);
        }, 3000); // 3 seconds
    };

    const handleContainerHoverLeave = (index: number) => {
        if (hoveredContainer === index) {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            setHoveredContainer(null);
            setTooltipVisibleIndex(null);
        }
    };

    useEffect(() => {
        setManualMode(false);
        setManualLayout(null);
        setAnimationFinished(false);

        if (skipAnimation) {
            setAnimationFinished(true);
            return;
        }

        let maxItems = 0;
        layout.forEach(l => maxItems = Math.max(maxItems, l.result.placedItems.length));
        
        if (maxItems === 0) {
            setAnimationFinished(true);
            return;
        }

        const totalDuration = (Math.max(0, maxItems - 1)) * (ANIMATION_DURATION + ANIMATION_GAP) + ANIMATION_DURATION;
        const timer = setTimeout(() => setAnimationFinished(true), totalDuration * 1000 + 500);
        return () => clearTimeout(timer);
    }, [layout, skipAnimation]);

    const handleEnterManualMode = () => {
        const copy = layout.map(item => ({
            ...item,
            result: JSON.parse(JSON.stringify(item.result)),
            offset: item.offset.clone()
        }));
        setManualLayout(copy);
        setManualMode(true);
    };

    if (manualMode && manualLayout) {
        return (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <div 
                   onClick={() => setManualMode(false)}
                   style={{
                       position: 'absolute',
                       top: '20px',
                       right: '20px',
                       zIndex: 1000,
                       backgroundColor: 'white',
                       padding: '10px',
                       borderRadius: '50%',
                       cursor: 'pointer',
                       boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                       display: 'flex',
                       alignItems: 'center',
                       justifyContent: 'center',
                       width: '48px',
                       height: '48px',
                       transition: 'transform 0.2s',
                       color: '#ef4444'
                   }}
                   title="Exit Manual Edit Mode"
                   onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                   onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
               >
                   <MousePointer2 size={24} />
                </div>
                <ManualContainer3D layout={manualLayout} />
            </div>
        );
   }

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {animationFinished && (
                <div 
                    onClick={handleEnterManualMode}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        zIndex: 1000,
                        backgroundColor: 'white',
                        padding: '10px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '48px',
                        height: '48px',
                        transition: 'transform 0.2s',
                        color: '#1e293b'
                    }}
                    title="Enter Manual Edit Mode"
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <MousePointer2 size={24} />
                </div>
            )}
            <Canvas shadows camera={{ position: [12, 8, 12], fov: 40 }}>
                <color attach="background" args={['#f1f5f9']} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 20, 10]} intensity={1} castShadow shadow-bias={-0.0001} />
                <group>
                    <gridHelper args={[100, 100, 0x94a3b8, 0xe2e8f0]} position={[0, -0.01, 0]} />
                    {layout.map(({ result, offset, index: resultIndex }) => {
                        const spec = CONTAINERS.find(c => c.type === result.containerType) || CONTAINERS[0];
                        const l = spec.dimensions.length * SCALE;
                        const w = spec.dimensions.width * SCALE;
                        const h = spec.dimensions.height * SCALE;
                        const marginH = FORKLIFT_LIFT_MARGIN_CM * SCALE;

                        return (
                            <group key={resultIndex}>
                                {/* Hover Trigger Group */}
                                <group 
                                    onPointerEnter={(e) => { e.stopPropagation(); handleContainerHoverEnter(resultIndex); }}
                                    onPointerLeave={(e) => { e.stopPropagation(); handleContainerHoverLeave(resultIndex); }}
                                >
                                    <group position={[offset.x + l/2, offset.y + h/2 + FLOOR_HEIGHT, offset.z + w/2]}>
                                        <lineSegments>
                                            <edgesGeometry args={[new THREE.BoxGeometry(l, h, w)]} />
                                            <lineBasicMaterial color="#475569" linewidth={2} />
                                        </lineSegments>
                                        <mesh position={[0, -h/2 - 0.02, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                                            <planeGeometry args={[l, w]} />
                                            <meshStandardMaterial color="#cbd5e1" />
                                        </mesh>
                                        {/* Forklift Margin Indicator at top */}
                                        <mesh position={[0, (h/2) - (marginH/2), 0]}>
                                            <boxGeometry args={[l, marginH, w]} />
                                            <meshBasicMaterial color="#ef4444" transparent opacity={0.15} />
                                        </mesh>
                                    </group>
                                    
                                     {/* Tooltip Anchor */}
                                     {tooltipVisibleIndex === resultIndex && (
                                        <Html position={[offset.x + l/2, offset.y + h + 0.5, offset.z + w/2]} center style={{ pointerEvents: 'none' }}>
                                            <HoverTooltip result={result} index={resultIndex} visible={true} />
                                        </Html>
                                    )}

                                    {/* Invisible Hit Box for easier hovering on empty space inside container */}
                                    <mesh position={[offset.x + l/2, offset.y + h/2 + FLOOR_HEIGHT, offset.z + w/2]} visible={false}> 
                                        <boxGeometry args={[l, h, w]} />
                                    </mesh>
                                </group>

                                {result.placedItems.map((item, i) => (
                                    <Box 
                                        key={item.id}
                                        item={item}
                                        delay={i * (ANIMATION_DURATION + ANIMATION_GAP)} 
                                        containerLength={spec.dimensions.length}
                                        containerWidth={spec.dimensions.width}
                                        animationDuration={ANIMATION_DURATION}
                                        offset={offset}
                                        skipAnimation={skipAnimation}
                                    />
                                ))}
                            </group>
                        );
                    })}
                </group>
                <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2} />
            </Canvas>
        </div>
    );
};
