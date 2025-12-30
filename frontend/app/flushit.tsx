import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect, G, Ellipse, Defs, ClipPath, Image as SvgImage, RadialGradient, Stop, LinearGradient } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for high score
const BEST_FLUSH_KEY = 'flushIt_bestScore';

// DEBUG FLAG - set to true to visualize stream influence zone
const DEBUG_STREAM = false;

// Smoothstep helper for smooth falloff
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Icon types
type IconType = 'poop' | 'teddy' | 'smiley' | 'custom';

interface IconConfig {
  id: IconType;
  name: string;
  icon: string;
  color: string;
  stickiness: number; // How hard to detach (0-1)
  friction: number; // Resistance to sliding
}

const ICON_CONFIGS: IconConfig[] = [
  { id: 'poop', name: 'Poop', icon: 'emoticon-poop', color: '#5D4037', stickiness: 0.8, friction: 0.6 },
  { id: 'teddy', name: 'Teddy', icon: 'teddy-bear', color: '#A1887F', stickiness: 0.5, friction: 0.4 },
  { id: 'smiley', name: 'Smiley', icon: 'emoticon-happy', color: '#FFC107', stickiness: 0.3, friction: 0.2 },
  { id: 'custom', name: 'Photo', icon: 'image', color: '#9C27B0', stickiness: 0.4, friction: 0.3 },
];

interface FlushObject {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  opacity: number;
  stuck: boolean;
  stickStrength: number;
  washPower: number; // Accumulated wash power from stream
  isFlushing: boolean;
  iconType: IconType;
  beingWashed: boolean; // Currently under stream influence
}

// Helper: Calculate distance from point to line segment
const pointToSegmentDistance = (
  px: number, py: number, 
  x1: number, y1: number, 
  x2: number, y2: number
): { distance: number; closest: { x: number; y: number }; t: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  
  if (lengthSq === 0) {
    // Segment is a point
    const dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    return { distance: dist, closest: { x: x1, y: y1 }, t: 0 };
  }
  
  // Project point onto line, clamped to segment
  let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
  
  return { distance, closest: { x: closestX, y: closestY }, t };
};

interface FlushItProps {
  onBack: () => void;
}

export default function FlushItGame({ onBack }: FlushItProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const GAME_WIDTH = windowWidth;
  const GAME_HEIGHT = windowHeight;

  // Bowl dimensions
  const BOWL_CENTER_X = GAME_WIDTH / 2;
  const BOWL_CENTER_Y = GAME_HEIGHT * 0.5;
  const BOWL_RADIUS_X = GAME_WIDTH * 0.42;
  const BOWL_RADIUS_Y = GAME_HEIGHT * 0.35;
  const DRAIN_Y = BOWL_CENTER_Y + BOWL_RADIUS_Y * 0.85;
  const DRAIN_RADIUS = 35;

  // Game state
  const [gameState, setGameState] = useState<'select' | 'playing' | 'complete'>('select');
  const [selectedIcon, setSelectedIcon] = useState<IconType>('poop');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [objects, setObjects] = useState<FlushObject[]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Liquid stream state
  const [isFlowing, setIsFlowing] = useState(false);
  const [flowOrigin, setFlowOrigin] = useState({ x: BOWL_CENTER_X, y: BOWL_CENTER_Y - BOWL_RADIUS_Y * 0.5 });
  const [flowDirection, setFlowDirection] = useState({ x: 0, y: 1 });
  const [flowStrength, setFlowStrength] = useState(0);

  // Refs
  const objectsRef = useRef<FlushObject[]>([]);
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(0);
  const gameLoopRef = useRef<number | null>(null);
  const flowTimeRef = useRef(0);

  // Load best score
  useEffect(() => {
    const loadBestScore = async () => {
      try {
        const stored = await AsyncStorage.getItem(BEST_FLUSH_KEY);
        if (stored !== null) {
          const value = parseInt(stored, 10);
          setBestScore(value);
          bestScoreRef.current = value;
        }
      } catch (e) {
        console.log('Failed to load best score:', e);
      }
    };
    loadBestScore();
  }, []);

  // Save best score
  const saveBestScore = useCallback(async (newBest: number) => {
    try {
      await AsyncStorage.setItem(BEST_FLUSH_KEY, newBest.toString());
      setBestScore(newBest);
      bestScoreRef.current = newBest;
    } catch (e) {
      console.log('Failed to save best score:', e);
    }
  }, []);

  // Pick custom image
  const pickCustomImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCustomImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setSelectedIcon('custom');
    }
  };

  // Spawn objects
  const spawnObjects = useCallback(() => {
    const config = ICON_CONFIGS.find(c => c.id === selectedIcon) || ICON_CONFIGS[0];
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 objects
    const newObjects: FlushObject[] = [];

    for (let i = 0; i < count; i++) {
      // Distribute around the bowl surface
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const radiusX = BOWL_RADIUS_X * (0.4 + Math.random() * 0.45);
      const radiusY = BOWL_RADIUS_Y * (0.3 + Math.random() * 0.45);
      
      newObjects.push({
        id: `obj-${i}-${Date.now()}`,
        x: BOWL_CENTER_X + Math.cos(angle) * radiusX,
        y: BOWL_CENTER_Y + Math.sin(angle) * radiusY * 0.7,
        vx: 0,
        vy: 0,
        rotation: Math.random() * 360,
        rotationSpeed: 0,
        scale: 0.8 + Math.random() * 0.4,
        opacity: 1,
        stuck: true,
        stickStrength: config.stickiness * (0.7 + Math.random() * 0.6),
        washPower: 0,
        isFlushing: false,
        iconType: selectedIcon,
        beingWashed: false,
      });
    }

    objectsRef.current = newObjects;
    setObjects(newObjects);
    scoreRef.current = 0;
    setScore(0);
  }, [selectedIcon, BOWL_CENTER_X, BOWL_CENTER_Y, BOWL_RADIUS_X, BOWL_RADIUS_Y]);

  // Start game
  const startGame = useCallback(() => {
    spawnObjects();
    setIsNewRecord(false);
    setGameState('playing');
  }, [spawnObjects]);

  // Check if object is in drain
  const isInDrain = useCallback((obj: FlushObject) => {
    const dx = obj.x - BOWL_CENTER_X;
    const dy = obj.y - DRAIN_Y;
    return Math.sqrt(dx * dx + dy * dy) < DRAIN_RADIUS + 15;
  }, [BOWL_CENTER_X, DRAIN_Y, DRAIN_RADIUS]);

  // Physics update
  const updatePhysics = useCallback(() => {
    const config = ICON_CONFIGS.find(c => c.id === selectedIcon) || ICON_CONFIGS[0];
    
    // Calculate stream endpoint for line segment collision
    const streamLength = 180 + flowStrength * 120;
    const streamEndX = flowOrigin.x + flowDirection.x * streamLength;
    const streamEndY = flowOrigin.y + flowDirection.y * streamLength;
    
    // Stream influence radius (wider than visual for reliable hits)
    const STREAM_INFLUENCE_RADIUS = 70 + flowStrength * 40;
    // Detach threshold - amount of washPower needed to unstick
    const DETACH_THRESHOLD = 0.4 + config.stickiness * 0.4;
    
    const updatedObjects = objectsRef.current.map(obj => {
      if (obj.isFlushing) {
        // Object is being flushed - shrink and fade
        return {
          ...obj,
          scale: obj.scale * 0.92,
          opacity: obj.opacity * 0.9,
          y: obj.y + 3,
          rotation: obj.rotation + obj.rotationSpeed,
        };
      }

      let newObj = { ...obj };

      // Apply liquid force if flowing
      if (isFlowing && flowStrength > 0) {
        // Use line segment distance for accurate stream collision
        const { distance, closest, t } = pointToSegmentDistance(
          obj.x, obj.y,
          flowOrigin.x, flowOrigin.y,
          streamEndX, streamEndY
        );
        
        // Check if object is within stream influence zone
        if (distance < STREAM_INFLUENCE_RADIUS) {
          // Calculate force based on proximity (closer = stronger)
          const proximityFactor = 1 - (distance / STREAM_INFLUENCE_RADIUS);
          // Force is stronger at the stream source (t=0) and weaker at end (t=1)
          const streamPositionFactor = 1 - t * 0.3;
          const baseForce = proximityFactor * streamPositionFactor * flowStrength;
          
          // Minimum force floor - ensures stuck items always feel the stream
          const MIN_FORCE = 0.15;
          const effectiveForce = Math.max(baseForce, MIN_FORCE) * 1.2;
          
          // Main force along stream direction
          const mainForce = effectiveForce * 0.8;
          newObj.vx += flowDirection.x * mainForce;
          newObj.vy += flowDirection.y * mainForce;
          
          // Lateral component - helps items slide around bowl curvature
          const lateralX = -flowDirection.y; // Perpendicular to flow
          const lateralY = flowDirection.x;
          const lateralBias = (obj.x - closest.x) > 0 ? 0.3 : -0.3;
          newObj.vx += lateralX * effectiveForce * lateralBias;
          newObj.vy += lateralY * effectiveForce * lateralBias;
          
          // Accumulate wash power for stuck items
          if (newObj.stuck) {
            // Faster accumulation when closer to stream center
            const washRate = effectiveForce * 0.08;
            newObj.washPower += washRate;
            
            // Jitter/wiggle effect while stuck (shows stream is affecting it)
            newObj.rotation += (Math.random() - 0.5) * effectiveForce * 15;
            newObj.rotationSpeed += (Math.random() - 0.5) * effectiveForce * 3;
            
            // Slight position jitter when stuck
            if (newObj.washPower < DETACH_THRESHOLD * 0.8) {
              newObj.x += (Math.random() - 0.5) * effectiveForce * 2;
              newObj.y += (Math.random() - 0.5) * effectiveForce * 2;
            }
            
            // Check if accumulated enough wash power to detach
            if (newObj.washPower >= DETACH_THRESHOLD) {
              newObj.stuck = false;
              newObj.stickStrength = 0;
              // Give initial push when detaching
              newObj.vx += flowDirection.x * 2;
              newObj.vy += flowDirection.y * 2;
            }
          }
          
          // Add rotation from flow (more when not stuck)
          const rotationMultiplier = newObj.stuck ? 0.5 : 2;
          newObj.rotationSpeed += flowDirection.x * effectiveForce * rotationMultiplier;
        }
      }

      // Apply gravity towards drain (only for unstuck objects)
      if (!newObj.stuck) {
        const toDrainX = BOWL_CENTER_X - newObj.x;
        const toDrainY = DRAIN_Y - newObj.y;
        const toDrainDist = Math.sqrt(toDrainX * toDrainX + toDrainY * toDrainY);
        
        // Stronger pull towards drain
        newObj.vx += (toDrainX / toDrainDist) * 0.12;
        newObj.vy += (toDrainY / toDrainDist) * 0.18;
      }

      // Apply friction (higher for stuck, lower for sliding)
      const friction = newObj.stuck ? 0.7 : 0.96;
      newObj.vx *= friction;
      newObj.vy *= friction;
      newObj.rotationSpeed *= 0.92;

      // Update position (stuck items move less)
      if (newObj.stuck) {
        newObj.x += newObj.vx * 0.3;
        newObj.y += newObj.vy * 0.3;
      } else {
        newObj.x += newObj.vx;
        newObj.y += newObj.vy;
      }
      newObj.rotation += newObj.rotationSpeed;

      // Keep within bowl bounds (ellipse constraint) - less aggressive clamping
      const relX = (newObj.x - BOWL_CENTER_X) / BOWL_RADIUS_X;
      const relY = (newObj.y - BOWL_CENTER_Y) / BOWL_RADIUS_Y;
      const ellipseDist = Math.sqrt(relX * relX + relY * relY);
      
      if (ellipseDist > 0.92) {
        const angle = Math.atan2(relY, relX);
        newObj.x = BOWL_CENTER_X + Math.cos(angle) * BOWL_RADIUS_X * 0.9;
        newObj.y = BOWL_CENTER_Y + Math.sin(angle) * BOWL_RADIUS_Y * 0.9;
        // Softer bounce off walls
        newObj.vx *= -0.2;
        newObj.vy *= -0.2;
      }

      // Check if entering drain
      if (!newObj.stuck && isInDrain(newObj)) {
        newObj.isFlushing = true;
        newObj.rotationSpeed = 15;
        scoreRef.current += 1;
        setScore(scoreRef.current);
      }

      return newObj;
    });

    // Remove fully flushed objects
    const remaining = updatedObjects.filter(obj => obj.opacity > 0.05);
    objectsRef.current = remaining;
    setObjects(remaining);

    // Check if all objects flushed
    if (remaining.length === 0 && gameState === 'playing') {
      const finalScore = scoreRef.current;
      if (finalScore > bestScoreRef.current) {
        setIsNewRecord(true);
        saveBestScore(finalScore);
      }
      setGameState('complete');
    }
  }, [isFlowing, flowStrength, flowOrigin, flowDirection, selectedIcon, 
      BOWL_CENTER_X, BOWL_CENTER_Y, BOWL_RADIUS_X, BOWL_RADIUS_Y, DRAIN_Y, 
      isInDrain, gameState, saveBestScore]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      return;
    }

    const loop = () => {
      flowTimeRef.current += 1;
      updatePhysics();
      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, updatePhysics]);

  // Touch handlers for liquid control
  const onTouchStart = useCallback((e: any) => {
    if (gameState !== 'playing') return;

    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;

    setIsFlowing(true);
    setFlowOrigin({ x: BOWL_CENTER_X, y: BOWL_CENTER_Y - BOWL_RADIUS_Y * 0.6 });
    
    // Calculate direction to touch point
    const dx = x - BOWL_CENTER_X;
    const dy = y - (BOWL_CENTER_Y - BOWL_RADIUS_Y * 0.6);
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    setFlowDirection({ x: dx / dist, y: dy / dist });
    setFlowStrength(0.5);
  }, [gameState, BOWL_CENTER_X, BOWL_CENTER_Y, BOWL_RADIUS_Y]);

  const onTouchMove = useCallback((e: any) => {
    if (gameState !== 'playing' || !isFlowing) return;

    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;

    // Update direction
    const dx = x - flowOrigin.x;
    const dy = y - flowOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 10) {
      setFlowDirection({ x: dx / dist, y: dy / dist });
      // Strength based on distance dragged
      setFlowStrength(Math.min(1, dist / 150));
    }
  }, [gameState, isFlowing, flowOrigin]);

  const onTouchEnd = useCallback(() => {
    setIsFlowing(false);
    setFlowStrength(0);
  }, []);

  // Render single object
  const renderObject = (obj: FlushObject) => {
    const config = ICON_CONFIGS.find(c => c.id === obj.iconType) || ICON_CONFIGS[0];
    const size = 35 * obj.scale;

    return (
      <G 
        key={obj.id} 
        transform={`translate(${obj.x}, ${obj.y}) rotate(${obj.rotation}) scale(${obj.scale})`}
        opacity={obj.opacity}
      >
        {obj.iconType === 'poop' && (
          <>
            <Ellipse cx={0} cy={8} rx={14} ry={8} fill="#4E342E" />
            <Ellipse cx={0} cy={2} rx={11} ry={7} fill="#5D4037" />
            <Ellipse cx={0} cy={-4} rx={8} ry={5} fill="#6D4C41" />
            <Ellipse cx={0} cy={-9} rx={4} ry={3} fill="#795548" />
            <Circle cx={-4} cy={0} r={2} fill="white" />
            <Circle cx={4} cy={0} r={2} fill="white" />
            <Circle cx={-3} cy={1} r={1} fill="#333" />
            <Circle cx={5} cy={1} r={1} fill="#333" />
          </>
        )}

        {obj.iconType === 'teddy' && (
          <>
            <Circle cx={0} cy={0} r={14} fill="#A1887F" />
            <Circle cx={-10} cy={-10} r={5} fill="#A1887F" />
            <Circle cx={10} cy={-10} r={5} fill="#A1887F" />
            <Circle cx={-10} cy={-10} r={3} fill="#8D6E63" />
            <Circle cx={10} cy={-10} r={3} fill="#8D6E63" />
            <Ellipse cx={0} cy={2} rx={6} ry={4} fill="#D7CCC8" />
            <Circle cx={-5} cy={-3} r={2} fill="#333" />
            <Circle cx={5} cy={-3} r={2} fill="#333" />
            <Circle cx={0} cy={2} r={2} fill="#333" />
          </>
        )}

        {obj.iconType === 'smiley' && (
          <>
            <Circle cx={0} cy={0} r={16} fill="#FFC107" />
            <Circle cx={0} cy={0} r={14} fill="#FFCA28" />
            <Circle cx={-5} cy={-3} r={3} fill="#333" />
            <Circle cx={5} cy={-3} r={3} fill="#333" />
            <Path d="M -7 5 Q 0 12 7 5" stroke="#333" strokeWidth={2} fill="none" />
          </>
        )}

        {obj.iconType === 'custom' && customImage && (
          <>
            <Defs>
              <ClipPath id={`clip-${obj.id}`}>
                <Circle cx={0} cy={0} r={16} />
              </ClipPath>
            </Defs>
            <Circle cx={0} cy={0} r={17} fill="#9C27B0" />
            <SvgImage
              x={-16}
              y={-16}
              width={32}
              height={32}
              href={customImage}
              clipPath={`url(#clip-${obj.id})`}
              preserveAspectRatio="xMidYMid slice"
            />
            <Circle cx={0} cy={0} r={16} fill="none" stroke="#7B1FA2" strokeWidth={2} />
          </>
        )}

        {obj.iconType === 'custom' && !customImage && (
          <>
            <Circle cx={0} cy={0} r={16} fill="#9C27B0" />
            <Circle cx={0} cy={0} r={14} fill="#AB47BC" />
            <Rect x={-6} y={-8} width={12} height={10} rx={1} fill="white" opacity={0.8} />
            <Circle cx={-2} cy={-4} r={2} fill="#E1BEE7" />
            <Path d="M -4 2 L 0 -2 L 4 2" fill="#C5CAE9" />
          </>
        )}

        {/* Stuck indicator - shows wash progress */}
        {obj.stuck && (
          <G>
            {/* Base stuck ring */}
            <Circle cx={0} cy={0} r={22} fill="none" stroke="rgba(255,150,0,0.4)" strokeWidth={2} />
            {/* Wash progress indicator (shrinks as washPower increases) */}
            {obj.washPower > 0 && (
              <Circle 
                cx={0} 
                cy={0} 
                r={22} 
                fill="none" 
                stroke="rgba(100,200,255,0.6)" 
                strokeWidth={3}
                strokeDasharray={`${obj.washPower * 140} 140`}
                transform="rotate(-90)"
              />
            )}
          </G>
        )}
      </G>
    );
  };

  // Render liquid stream
  const renderLiquidStream = () => {
    if (!isFlowing || flowStrength <= 0) return null;

    const streamLength = 100 + flowStrength * 100;
    const endX = flowOrigin.x + flowDirection.x * streamLength;
    const endY = flowOrigin.y + flowDirection.y * streamLength;
    
    // Wavy stream effect
    const wave = Math.sin(flowTimeRef.current * 0.2) * 5;

    return (
      <G>
        {/* Main stream */}
        <Path
          d={`M ${flowOrigin.x} ${flowOrigin.y} 
              Q ${flowOrigin.x + flowDirection.x * streamLength * 0.5 + wave} 
                ${flowOrigin.y + flowDirection.y * streamLength * 0.5}
                ${endX} ${endY}`}
          stroke="#FFE082"
          strokeWidth={12 + flowStrength * 8}
          strokeLinecap="round"
          fill="none"
          opacity={0.8}
        />
        {/* Highlight */}
        <Path
          d={`M ${flowOrigin.x} ${flowOrigin.y} 
              Q ${flowOrigin.x + flowDirection.x * streamLength * 0.5 + wave} 
                ${flowOrigin.y + flowDirection.y * streamLength * 0.5}
                ${endX} ${endY}`}
          stroke="#FFF59D"
          strokeWidth={4 + flowStrength * 3}
          strokeLinecap="round"
          fill="none"
          opacity={0.6}
        />
        {/* Splash at end */}
        {flowStrength > 0.3 && (
          <>
            <Circle cx={endX + wave * 0.5} cy={endY} r={8 + flowStrength * 5} fill="#FFE082" opacity={0.5} />
            <Circle cx={endX - 5 + wave} cy={endY + 5} r={4} fill="#FFF59D" opacity={0.4} />
            <Circle cx={endX + 8} cy={endY - 3} r={3} fill="#FFF59D" opacity={0.3} />
          </>
        )}
      </G>
    );
  };

  // Render toilet bowl
  const renderBowl = () => (
    <G>
      {/* Outer rim */}
      <Ellipse 
        cx={BOWL_CENTER_X} 
        cy={BOWL_CENTER_Y - 20} 
        rx={BOWL_RADIUS_X + 15} 
        ry={BOWL_RADIUS_Y * 0.3} 
        fill="#E0E0E0"
        stroke="#BDBDBD"
        strokeWidth={3}
      />

      {/* Bowl interior gradient */}
      <Defs>
        <RadialGradient id="bowlGrad" cx="50%" cy="30%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor="#FAFAFA" />
          <Stop offset="70%" stopColor="#E8E8E8" />
          <Stop offset="100%" stopColor="#BDBDBD" />
        </RadialGradient>
      </Defs>

      {/* Main bowl */}
      <Ellipse 
        cx={BOWL_CENTER_X} 
        cy={BOWL_CENTER_Y} 
        rx={BOWL_RADIUS_X} 
        ry={BOWL_RADIUS_Y} 
        fill="url(#bowlGrad)"
      />

      {/* Water surface */}
      <Ellipse 
        cx={BOWL_CENTER_X} 
        cy={BOWL_CENTER_Y + BOWL_RADIUS_Y * 0.1} 
        rx={BOWL_RADIUS_X * 0.85} 
        ry={BOWL_RADIUS_Y * 0.7} 
        fill="#E3F2FD"
        opacity={0.5}
      />

      {/* Drain hole */}
      <Ellipse 
        cx={BOWL_CENTER_X} 
        cy={DRAIN_Y} 
        rx={DRAIN_RADIUS} 
        ry={DRAIN_RADIUS * 0.6} 
        fill="#424242"
      />
      <Ellipse 
        cx={BOWL_CENTER_X} 
        cy={DRAIN_Y - 3} 
        rx={DRAIN_RADIUS - 5} 
        ry={(DRAIN_RADIUS - 5) * 0.5} 
        fill="#212121"
      />

      {/* Rim highlight */}
      <Ellipse 
        cx={BOWL_CENTER_X} 
        cy={BOWL_CENTER_Y - BOWL_RADIUS_Y * 0.85} 
        rx={BOWL_RADIUS_X * 0.6} 
        ry={15} 
        fill="white"
        opacity={0.4}
      />
    </G>
  );

  // Render icon selection
  const renderSelection = () => (
    <View style={styles.selectionOverlay}>
      <MaterialCommunityIcons name="toilet" size={60} color="white" />
      <Text style={styles.titleText}>Flush It</Text>
      <Text style={styles.subtitleText}>Pick what to flush away!</Text>

      <View style={styles.iconGrid}>
        {ICON_CONFIGS.map(config => (
          <TouchableOpacity
            key={config.id}
            style={[
              styles.iconCard,
              selectedIcon === config.id && styles.iconCardSelected,
            ]}
            onPress={() => {
              if (config.id === 'custom') {
                pickCustomImage();
              } else {
                setSelectedIcon(config.id);
              }
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: config.color }]}>
              <MaterialCommunityIcons name={config.icon as any} size={32} color="white" />
            </View>
            <Text style={styles.iconName}>{config.name}</Text>
            {config.id === 'custom' && (
              <Text style={styles.uploadHint}>Tap to upload</Text>
            )}
            {selectedIcon === config.id && (
              <View style={styles.selectedBadge}>
                <Ionicons name="checkmark" size={14} color="white" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {customImage && selectedIcon === 'custom' && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>Your image will be flushed!</Text>
          <Image source={{ uri: customImage }} style={styles.previewImage} />
        </View>
      )}

      <TouchableOpacity style={styles.startButton} onPress={startGame}>
        <MaterialCommunityIcons name="water" size={28} color="white" />
        <Text style={styles.startButtonText}>Start Flushing!</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButtonSelection} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color="white" />
        <Text style={styles.backButtonText}>Back to Menu</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />

      {/* Background */}
      <View style={styles.background} />

      {/* Game Canvas */}
      <View
        style={styles.gameContainer}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouchStart}
        onResponderMove={onTouchMove}
        onResponderRelease={onTouchEnd}
        onResponderTerminate={onTouchEnd}
      >
        <Svg
          style={StyleSheet.absoluteFill}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          viewBox={`0 0 ${GAME_WIDTH} ${GAME_HEIGHT}`}
        >
          {gameState !== 'select' && (
            <>
              {renderBowl()}
              {objects.map(obj => renderObject(obj))}
              {renderLiquidStream()}
            </>
          )}
        </Svg>
      </View>

      {/* UI Overlay */}
      {gameState !== 'select' && (
        <View style={styles.uiOverlay}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>

          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>Flushed</Text>
            <Text style={styles.scoreText}>{score}</Text>
          </View>

          <View style={styles.bestContainer}>
            <Text style={styles.bestLabel}>Best</Text>
            <Text style={styles.bestText}>{bestScore}</Text>
          </View>

          <TouchableOpacity 
            style={styles.restartButton} 
            onPress={startGame}
          >
            <Ionicons name="reload" size={22} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Instructions */}
      {gameState === 'playing' && objects.some(o => o.stuck) && (
        <View style={styles.instructionOverlay} pointerEvents="none">
          <Text style={styles.instructionText}>Touch & drag to aim the stream</Text>
        </View>
      )}

      {/* Complete overlay */}
      {gameState === 'complete' && (
        <View style={styles.completeOverlay}>
          {isNewRecord && (
            <View style={styles.newRecordBanner}>
              <MaterialCommunityIcons name="star" size={24} color="#FFD700" />
              <Text style={styles.newRecordText}>NEW RECORD!</Text>
              <MaterialCommunityIcons name="star" size={24} color="#FFD700" />
            </View>
          )}
          <MaterialCommunityIcons name="check-circle" size={80} color="#4CAF50" />
          <Text style={styles.completeTitle}>All Clean!</Text>
          <Text style={styles.completeScore}>Flushed: {score}</Text>
          <Text style={styles.completeBest}>Best: {bestScore}</Text>
          
          <TouchableOpacity style={styles.playAgainButton} onPress={startGame}>
            <Ionicons name="reload" size={24} color="white" />
            <Text style={styles.playAgainText}>Flush Again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.changeIconButton} onPress={() => setGameState('select')}>
            <Text style={styles.changeIconText}>Change Icon</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Selection Screen */}
      {gameState === 'select' && renderSelection()}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#37474F',
  },
  gameContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  uiOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 25,
  },
  scoreContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 10,
    alignItems: 'center',
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  scoreText: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: 'bold',
  },
  bestContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 10,
    alignItems: 'center',
  },
  bestLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  bestText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  restartButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 25,
    marginLeft: 'auto',
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 40, 50, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  titleText: {
    color: 'white',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 15,
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 25,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
    maxWidth: 350,
  },
  iconCard: {
    width: '45%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  iconCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 4,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  previewLabel: {
    color: '#FFC107',
    fontSize: 13,
    marginBottom: 10,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#FFC107',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    marginTop: 30,
    gap: 12,
  },
  startButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  backButtonSelection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  backButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  instructionOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  completeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newRecordBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.25)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginBottom: 15,
    gap: 10,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  newRecordText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
  },
  completeTitle: {
    color: '#4CAF50',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 15,
  },
  completeScore: {
    color: 'white',
    fontSize: 22,
    marginTop: 10,
  },
  completeBest: {
    color: '#FFE082',
    fontSize: 18,
    marginTop: 5,
  },
  playAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: 30,
    gap: 10,
  },
  playAgainText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  changeIconButton: {
    marginTop: 15,
    padding: 10,
  },
  changeIconText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
});
