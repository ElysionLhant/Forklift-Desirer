
import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedItem, ContainerSpec, PackingResult } from '../types';
import { CONTAINERS } from '../constants';

const SCALE = 0.01; 
const HUMAN_THRESHOLD_WEIGHT = 30; 
const FLOOR_HEIGHT = 0.16; 
const ANIMATION_DURATION = 2.0; 
const ANIMATION_GAP = 0.2;
const LIFT_BUFFER = 0.1; 
const FORKLIFT_LIFT_MARGIN_CM = 15;

const FORKLIFT_DIMS = {
    chassisLength: 2.2,
    chassisWidth: 1.1,
    chassisHeight: 1.4,
    forkLength: 1.1, 
    mastHeight: 1.6,
    wheelRadius: 0.25,
    freeLift: 1.2 
};

const HumanModel: React.FC = () => {
  return (
    <group position={[0, 0.9, 0]}>
        <mesh position={[0, 0.7, 0]}><sphereGeometry args={[0.15]} /><meshStandardMaterial color="#fca5a5" /></mesh>
        <mesh position={[0, 0.2, 0]}><capsuleGeometry args={[0.2, 0.8]} /><meshStandardMaterial color="#3b82f6" /></mesh>
        <mesh position={[0.2, 0.3, 0]} rotation={[0, 0, -0.5]}><capsuleGeometry args={[0.08, 0.6]} /><meshStandardMaterial color="#3b82f6" /></mesh>
        <mesh position={[-0.2, 0.3, 0]} rotation={[0, 0, 0.5]}><capsuleGeometry args={[0.08, 0.6]} /><meshStandardMaterial color="#3b82f6" /></mesh>
    </group>
  );
};

const Forklift: React.FC<{ liftHeight: number; sideShift: number; boxWidth: number; boxLength: number }> = ({ liftHeight, sideShift, boxWidth, boxLength }) => {
    const totalLiftFromGround = liftHeight + FLOOR_HEIGHT;
    const extension = Math.max(0, totalLiftFromGround - FORKLIFT_DIMS.freeLift);
    const targetSpreadOffset = boxWidth * 0.25;
    const forkSpread = Math.min(0.4, Math.max(0.1, targetSpreadOffset));
    const carriageWidth = 1.0; 

    return (
        <group rotation={[0, -Math.PI/2, 0]}> 
            <group rotation={[0, Math.PI/2, 0]}>
                <group position={[0.15, 0, 0]}>
                    <mesh position={[FORKLIFT_DIMS.chassisLength/2, 0.6, 0]} castShadow><boxGeometry args={[FORKLIFT_DIMS.chassisLength, 0.7, FORKLIFT_DIMS.chassisWidth]} /><meshStandardMaterial color="#fbbf24" roughness={0.3} /></mesh>
                    <mesh position={[FORKLIFT_DIMS.chassisLength - 0.3, 0.7, 0]}><boxGeometry args={[0.6, 0.8, FORKLIFT_DIMS.chassisWidth]} /><meshStandardMaterial color="#d97706" /></mesh>
                    <mesh position={[0.8, 1.8, 0.5]}><boxGeometry args={[0.05, 1.4, 0.05]} /><meshStandardMaterial color="#1f2937" /></mesh>
                    <mesh position={[0.8, 1.8, -0.5]}><boxGeometry args={[0.05, 1.4, 0.05]} /><meshStandardMaterial color="#1f2937" /></mesh>
                    <mesh position={[1.8, 1.8, 0.5]}><boxGeometry args={[0.05, 1.4, 0.05]} /><meshStandardMaterial color="#1f2937" /></mesh>
                    <mesh position={[1.8, 1.8, -0.5]}><boxGeometry args={[0.05, 1.4, 0.05]} /><meshStandardMaterial color="#1f2937" /></mesh>
                    <mesh position={[1.3, 2.5, 0]}><boxGeometry args={[1.2, 0.05, 1.1]} /><meshStandardMaterial color="#1f2937" /></mesh>
                    <mesh position={[0.4, 0.25, 0.45]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.25, 24]} /><meshStandardMaterial color="#111" /></mesh>
                    <mesh position={[0.4, 0.25, -0.45]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.25, 24]} /><meshStandardMaterial color="#111" /></mesh>
                    <mesh position={[1.8, 0.25, 0.45]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.25, 24]} /><meshStandardMaterial color="#111" /></mesh>
                    <mesh position={[1.8, 0.25, -0.45]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.25, 24]} /><meshStandardMaterial color="#111" /></mesh>
                    <group position={[-0.1, 0, 0]}>
                        <mesh position={[0, FORKLIFT_DIMS.mastHeight/2 + 0.2, 0.35]}><boxGeometry args={[0.15, FORKLIFT_DIMS.mastHeight, 0.1]} /><meshStandardMaterial color="#1f2937" /></mesh>
                        <mesh position={[0, FORKLIFT_DIMS.mastHeight/2 + 0.2, -0.35]}><boxGeometry args={[0.15, FORKLIFT_DIMS.mastHeight, 0.1]} /><meshStandardMaterial color="#1f2937" /></mesh>
                        <mesh position={[0, FORKLIFT_DIMS.mastHeight + 0.15, 0]}><boxGeometry args={[0.1, 0.1, 0.8]} /><meshStandardMaterial color="#1f2937" /></mesh>
                    </group>
                </group>
                {extension > 0.01 && (
                    <group position={[0.05, extension, 0]}>
                        <mesh position={[0, FORKLIFT_DIMS.mastHeight/2 + 0.2, 0.32]}><boxGeometry args={[0.1, FORKLIFT_DIMS.mastHeight, 0.08]} /><meshStandardMaterial color="#4b5563" /></mesh>
                        <mesh position={[0, FORKLIFT_DIMS.mastHeight/2 + 0.2, -0.32]}><boxGeometry args={[0.1, FORKLIFT_DIMS.mastHeight, 0.08]} /><meshStandardMaterial color="#4b5563" /></mesh>
                    </group>
                )}
                <group position={[0, totalLiftFromGround, 0]}>
                    {/* Fixed Carriage (Plate & Backrest) - Does NOT side shift */}
                    <group position={[0, 0, 0]}>
                        <mesh position={[0.05, 0.2, 0]}><boxGeometry args={[0.05, 0.4, carriageWidth]} /><meshStandardMaterial color="#111" /></mesh>
                        <mesh position={[0.05, 0.5, 0]}><boxGeometry args={[0.02, 0.6, 1.0]} /><meshStandardMaterial color="#333" /></mesh>
                    </group>
                    
                    {/* Moving Forks - Only these apply sideShift */}
                    <group position={[0, 0, sideShift]}>
                        <mesh position={[-FORKLIFT_DIMS.forkLength/2 - 0.05, -0.02, forkSpread]}><boxGeometry args={[FORKLIFT_DIMS.forkLength, 0.04, 0.12]} /><meshStandardMaterial color="#ef4444" /></mesh>
                        <mesh position={[-FORKLIFT_DIMS.forkLength/2 - 0.05, -0.02, -forkSpread]}><boxGeometry args={[FORKLIFT_DIMS.forkLength, 0.04, 0.12]} /><meshStandardMaterial color="#ef4444" /></mesh>
                    </group>
                </group>
            </group>
        </group>
    );
};

interface BoxProps {
  item: PlacedItem;
  delay: number;
  containerLength: number;
  containerWidth: number;
  animationDuration: number;
  offset: THREE.Vector3; 
  skipAnimation: boolean;
}

const Box: React.FC<BoxProps> = ({ item, delay, containerLength, containerWidth, animationDuration, offset, skipAnimation }) => {
  const groupRef = useRef<THREE.Group>(null);
  const boxMeshRef = useRef<THREE.Group>(null);
  const [showCarrier, setShowCarrier] = useState(false);
  const [currentLiftHeight, setCurrentLiftHeight] = useState(0);

  const w = item.dimensions.width * SCALE;
  const h = item.dimensions.height * SCALE;
  const l = item.dimensions.length * SCALE;

  const targetLocalX = (item.position.x * SCALE) + (l / 2);
  const targetLocalY = (item.position.y * SCALE) + FLOOR_HEIGHT; 
  const targetLocalZ = (item.position.z * SCALE) + (w / 2);
  
  const targetBoxCenterX = targetLocalX + offset.x;
  const targetBoxBottomY = targetLocalY + offset.y - FLOOR_HEIGHT; 
  const targetBoxWorldY = targetLocalY + offset.y; 
  const targetBoxCenterZ = targetLocalZ + offset.z;

  const isManual = item.weight < HUMAN_THRESHOLD_WEIGHT;
  
  const contW = containerWidth * SCALE;
  const halfChassisW = FORKLIFT_DIMS.chassisWidth / 2;
  const minChassisZ = halfChassisW + 0.1; 
  const maxChassisZ = contW - halfChassisW - 0.1;
  
  const localTargetZ = targetBoxCenterZ - offset.z; 
  const clampedLocalChassisZ = Math.max(minChassisZ, Math.min(localTargetZ, maxChassisZ));
  const sideShiftAmount = (targetBoxCenterZ - offset.z) - clampedLocalChassisZ;

  useFrame((state) => {
    if (!groupRef.current || !boxMeshRef.current) return;
    if (skipAnimation) {
         groupRef.current.visible = true;
         groupRef.current.position.set(targetBoxCenterX, 0, targetBoxCenterZ);
         boxMeshRef.current.position.set(0, targetBoxWorldY + h/2, 0);
         if (showCarrier) setShowCarrier(false);
         return;
    }
    const time = state.clock.elapsedTime;
    const startTime = delay;
    const totalDuration = animationDuration;
    const loadDuration = totalDuration * 0.9; 
    const endTime = startTime + totalDuration;

    if (time < startTime) {
      groupRef.current.visible = false;
      setShowCarrier(false);
    } else if (time < startTime + loadDuration) {
      groupRef.current.visible = true;
      setShowCarrier(true);
      const progress = (time - startTime) / loadDuration;
      let currX, currZ, currLift;
      const p1 = 0.35; const p2 = 0.60; const p3 = 0.85; const p4 = 1.0;
      const clearance = 1.5; 
      const stagingX = targetBoxCenterX + clearance + (l/2); 
      const doorX = (containerLength * SCALE) + 3.0 + offset.x;
      const startPosX = Math.max(doorX, stagingX + 3.0);
      const travelLift = 0.15; 
      const moveLiftHeight = Math.max(travelLift, targetBoxBottomY + LIFT_BUFFER);

      if (progress < p1) {
          const p = progress / p1;
          const ease = 1 - Math.pow(1 - p, 3); 
          currX = THREE.MathUtils.lerp(startPosX, stagingX, ease);
          currZ = targetBoxCenterZ;
          currLift = travelLift; 
      } else if (progress < p2) {
          const p = (progress - p1) / (p2 - p1);
          const ease = p * p * (3 - 2 * p);
          currX = stagingX; currZ = targetBoxCenterZ;
          currLift = THREE.MathUtils.lerp(travelLift, moveLiftHeight, ease);
      } else if (progress < p3) {
          const p = (progress - p2) / (p3 - p2);
          const ease = p * (2 - p);
          currX = THREE.MathUtils.lerp(stagingX, targetBoxCenterX, ease);
          currZ = targetBoxCenterZ; currLift = moveLiftHeight; 
      } else {
          const p = (progress - p3) / (p4 - p3);
          const ease = p * p; 
          currX = targetBoxCenterX; currZ = targetBoxCenterZ;
          currLift = THREE.MathUtils.lerp(moveLiftHeight, targetBoxBottomY, ease);
      }
      groupRef.current.position.set(currX, 0, currZ);
      boxMeshRef.current.position.set(0, FLOOR_HEIGHT + currLift + h/2, 0);
      setCurrentLiftHeight(currLift);
    } else {
      groupRef.current.visible = true;
      groupRef.current.position.set(targetBoxCenterX, 0, targetBoxCenterZ);
      boxMeshRef.current.position.set(0, targetBoxWorldY + h/2, 0);
      setShowCarrier(false);
    }
  });

  const forkliftLocalX = (l / 2) + 0.65; 
  const chassisShift = clampedLocalChassisZ - (targetBoxCenterZ - offset.z);

  return (
    <group ref={groupRef}>
      <group ref={boxMeshRef}>
        <mesh castShadow receiveShadow>
            <boxGeometry args={[l, h, w]} />
            <meshStandardMaterial color={item.color} roughness={0.6} metalness={0.1} />
            <Edges color="#333" threshold={15} />
        </mesh>
      </group>
      {showCarrier && (
         <group>
             {isManual ? (
                 <group position={[0.4, 0, 0]}><HumanModel /></group>
             ) : (
                 <group position={[forkliftLocalX, 0, chassisShift]}>
                    <Forklift liftHeight={currentLiftHeight} sideShift={-chassisShift} boxWidth={w} boxLength={l} />
                 </group>
             )}
         </group>
      )}
    </group>
  );
};

// Fixed missing Container3DProps interface
interface Container3DProps {
  container: ContainerSpec;
  results: PackingResult[];
  viewMode: 'single' | 'all';
  currentIndex: number;
  skipAnimation: boolean;
}

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
                                {result.containerType} #{index + 1}
                            </Text>
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
    );
};
