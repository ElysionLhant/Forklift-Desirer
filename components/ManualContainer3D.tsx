
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { PackingResult } from '../types';
import { CONTAINERS } from '../constants';
import { SCALE, FLOOR_HEIGHT, FORKLIFT_LIFT_MARGIN_CM, ANIMATION_DURATION, Box } from './SceneElements';

interface ManualContainer3DProps {
  layout: { result: PackingResult, offset: THREE.Vector3, index: number }[];
}

export const ManualContainer3D: React.FC<ManualContainer3DProps> = ({ layout }) => {
    return (
        <Canvas shadows camera={{ position: [12, 8, 12], fov: 40 }}>
            <color attach="background" args={['#f1f5f9']} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 20, 10]} intensity={1} castShadow shadow-bias={-0.0001} />
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
                                {/* Forklift Margin Indicator at top */}
                                <mesh position={[0, (h/2) - (marginH/2), 0]}>
                                    <boxGeometry args={[l, marginH, w]} />
                                    <meshBasicMaterial color="#ef4444" transparent opacity={0.15} />
                                </mesh>
                            </group>
                            <Text position={[offset.x + l/2, offset.y + h + 1.0, offset.z + w/2]} fontSize={0.6} color="#1e293b" rotation={[0, -Math.PI/2, 0]}>
                                {result.containerType} #{index + 1} (Manual)
                            </Text>
                            {result.placedItems.map((item, i) => (
                                <Box 
                                    key={item.id}
                                    item={item}
                                    delay={0} 
                                    containerLength={spec.dimensions.length}
                                    containerWidth={spec.dimensions.width}
                                    animationDuration={ANIMATION_DURATION}
                                    offset={offset}
                                    skipAnimation={true}
                                />
                            ))}
                        </group>
                    );
                })}
            </group>
            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2} />
        </Canvas>
    );
};
