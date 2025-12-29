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
  Modal,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect, G, Ellipse, Line, Defs, Marker, Polygon } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

// Physics constants
const GRAVITY = 0.5;
const AIR_FRICTION = 0.995;
const GROUND_FRICTION = 0.85;
const BOUNCE = 0.3;
const PAN_BOUNCE = 0.4;
const PATTY_RADIUS = 45; // INCREASED patty size
const PATTY_HEIGHT = 22; // Patty is elliptical
const WIN_STABILITY_TIME = 1000; // 1 second
const SPAWN_DELAY = 1200;
const STACK_FRICTION = 0.7; // High friction for stacking
const STACK_DAMPING = 0.92; // Damping when on target
const MAX_ARROW_LENGTH = 150;
const LAUNCH_POWER_MULTIPLIER = 0.15;

// Built-in backgrounds
const BUILT_IN_BACKGROUNDS = [
  { id: 'kitchen', name: 'Kitchen', color: '#8B5A2B' },
  { id: 'restaurant', name: 'Restaurant', color: '#4A3728' },
  { id: 'outdoor', name: 'Outdoor BBQ', color: '#2E5A3C' },
  { id: 'night', name: 'Night Kitchen', color: '#1A1A2E' },
];

interface Point {
  x: number;
  y: number;
}

interface Patty {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  height: number;
  rotation: number;
  rotationSpeed: number;
  isOnPan: boolean;
  isOnTarget: boolean;
  isStacked: boolean;
  stableTime: number;
}

interface Pan {
  x: number;
  y: number;
  width: number;
  height: number;
  tilt: number;
  vx: number;
}

interface Target {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Level {
  id: number;
  dispenserX: number;
  dispenserY: number;
  target: Target;
  panStartX: number;
  requiredPatties: number;
}

const TOTAL_LEVELS = 5;

export default function BurgerStackGame() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const GAME_WIDTH = windowWidth;
  const GAME_HEIGHT = windowHeight;

  const [currentLevel, setCurrentLevel] = useState(0);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'aiming' | 'win' | 'fail'>('waiting');
  const [activePatty, setActivePatty] = useState<Patty | null>(null);
  const [stackedPatties, setStackedPatties] = useState<Patty[]>([]);
  const [pan, setPan] = useState<Pan>({
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT * 0.55,
    width: 130,
    height: 28,
    tilt: 0,
    vx: 0,
  });
  
  // Aiming system
  const [aimStart, setAimStart] = useState<Point | null>(null);
  const [aimEnd, setAimEnd] = useState<Point | null>(null);
  const [isAiming, setIsAiming] = useState(false);
  
  // Background settings
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState('#8B5A2B');
  const [backgroundMode, setBackgroundMode] = useState<'fill' | 'fit'>('fill');
  const [backgroundBrightness, setBackgroundBrightness] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  
  // Refs
  const gameLoopRef = useRef<number | null>(null);
  const activePattyRef = useRef<Patty | null>(null);
  const stackedPattiesRef = useRef<Patty[]>([]);
  const panRef = useRef<Pan>(pan);
  const isDraggingRef = useRef(false);
  const lastTouchXRef = useRef(0);
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate level config with varying target positions
  const getLevelConfig = useCallback((levelIndex: number): Level => {
    // Target Y position varies by level (higher = harder)
    const targetYPositions = [
      GAME_HEIGHT - 140,  // Level 1: bottom
      GAME_HEIGHT - 180,  // Level 2: slightly higher
      GAME_HEIGHT - 220,  // Level 3: mid-low
      GAME_HEIGHT - 280,  // Level 4: mid
      GAME_HEIGHT - 340,  // Level 5: high
    ];
    
    const targetXPositions = [
      GAME_WIDTH * 0.7,
      GAME_WIDTH * 0.75,
      GAME_WIDTH * 0.65,
      GAME_WIDTH * 0.3,
      GAME_WIDTH * 0.5,
    ];

    return {
      id: levelIndex + 1,
      dispenserX: GAME_WIDTH * 0.5,
      dispenserY: 60,
      target: {
        x: targetXPositions[levelIndex] - 55,
        y: targetYPositions[levelIndex],
        width: 110,
        height: 50,
      },
      panStartX: GAME_WIDTH * 0.35,
      requiredPatties: Math.min(2 + levelIndex, 5), // 2, 3, 4, 5, 5 patties per level
    };
  }, [GAME_WIDTH, GAME_HEIGHT]);

  const level = getLevelConfig(currentLevel);

  // Initialize pan position for current level
  useEffect(() => {
    const newPan = {
      x: level.panStartX,
      y: GAME_HEIGHT * 0.55,
      width: 130,
      height: 28,
      tilt: 0,
      vx: 0,
    };
    setPan(newPan);
    panRef.current = newPan;
    setStackedPatties([]);
    stackedPattiesRef.current = [];
  }, [currentLevel, level.panStartX, GAME_HEIGHT]);

  // Spawn patty from dispenser
  const spawnPatty = useCallback(() => {
    const newPatty: Patty = {
      id: Date.now().toString(),
      x: level.dispenserX,
      y: level.dispenserY + 60,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 2,
      radius: PATTY_RADIUS,
      height: PATTY_HEIGHT,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
      isOnPan: false,
      isOnTarget: false,
      isStacked: false,
      stableTime: 0,
    };
    activePattyRef.current = newPatty;
    setActivePatty(newPatty);
    setGameState('playing');
    setIsAiming(false);
    setAimStart(null);
    setAimEnd(null);
  }, [level.dispenserX, level.dispenserY]);

  // Auto-spawn first patty
  useEffect(() => {
    if (gameState === 'waiting') {
      spawnTimerRef.current = setTimeout(() => {
        spawnPatty();
      }, SPAWN_DELAY);
    }
    return () => {
      if (spawnTimerRef.current) {
        clearTimeout(spawnTimerRef.current);
      }
    };
  }, [gameState, spawnPatty]);

  // Check if patty is on pan
  const checkPanCollision = useCallback((p: Patty, panState: Pan): { onPan: boolean; collision: boolean } => {
    const panLeft = panState.x - panState.width / 2;
    const panRight = panState.x + panState.width / 2;
    const panTop = panState.y - panState.height / 2;
    const tiltOffset = panState.tilt * 12;
    
    // Check horizontal bounds
    if (p.x + p.radius < panLeft || p.x - p.radius > panRight) {
      return { onPan: false, collision: false };
    }
    
    // Calculate pan surface Y at patty position
    const relativeX = (p.x - panState.x) / (panState.width / 2);
    const panSurfaceY = panTop - tiltOffset * relativeX;
    
    // Check if patty bottom is touching pan surface
    const pattyBottom = p.y + p.height / 2;
    const distToSurface = pattyBottom - panSurfaceY;
    
    if (distToSurface > -5 && distToSurface < p.height && p.vy >= 0) {
      return { onPan: true, collision: distToSurface > 0 };
    }
    
    return { onPan: false, collision: false };
  }, []);

  // Check collision with target platform (for stacking)
  const checkTargetCollision = useCallback((p: Patty, stack: Patty[]): { onTarget: boolean; restY: number } => {
    const target = level.target;
    const targetLeft = target.x - 10; // More forgiving left bound
    const targetRight = target.x + target.width + 10; // More forgiving right bound
    const targetTop = target.y;
    const targetCenterX = target.x + target.width / 2;
    
    // Check if patty center is reasonably within target horizontal bounds
    // Allow patty to overlap edges
    if (p.x < targetLeft || p.x > targetRight) {
      return { onTarget: false, restY: 0 };
    }
    
    // Find the highest point to rest on (target or stacked patties)
    let highestSurface = targetTop;
    
    for (const stacked of stack) {
      if (stacked.id === p.id) continue;
      // Check if this patty is roughly above the stacked one
      const horizontalOverlap = Math.abs(p.x - stacked.x) < p.radius * 1.5;
      if (horizontalOverlap && stacked.y < highestSurface) {
        highestSurface = stacked.y - stacked.height * 1.5;
      }
    }
    
    const pattyBottom = p.y + p.height / 2;
    
    // More forgiving collision detection
    if (pattyBottom >= highestSurface - 15) {
      return { onTarget: true, restY: highestSurface - p.height / 2 };
    }
    
    return { onTarget: false, restY: 0 };
  }, [level.target]);

  // Physics update
  const updatePhysics = useCallback(() => {
    if (!activePattyRef.current || (gameState !== 'playing' && gameState !== 'aiming')) return;

    const p = { ...activePattyRef.current };
    const panState = panRef.current;
    const stack = stackedPattiesRef.current;
    
    // Skip physics if aiming (patty stays on pan)
    if (gameState === 'aiming' && p.isOnPan) {
      // Keep patty on pan while aiming
      p.x = panState.x;
      p.y = panState.y - panState.height / 2 - p.height / 2 - 5;
      p.vx = 0;
      p.vy = 0;
      activePattyRef.current = p;
      setActivePatty(p);
      return;
    }
    
    // Apply gravity
    p.vy += GRAVITY;
    
    // Apply velocity
    p.x += p.vx;
    p.y += p.vy;
    
    // Air friction
    p.vx *= AIR_FRICTION;
    
    // Update rotation
    p.rotation += p.rotationSpeed;
    p.rotationSpeed *= 0.98;

    // Check pan collision
    const panCheck = checkPanCollision(p, panState);
    if (panCheck.collision && !p.isOnTarget) {
      // Land on pan
      const panTop = panState.y - panState.height / 2;
      const tiltOffset = panState.tilt * 12;
      const relativeX = (p.x - panState.x) / (panState.width / 2);
      const panSurfaceY = panTop - tiltOffset * relativeX;
      
      p.y = panSurfaceY - p.height / 2 - 2;
      p.vy = -Math.abs(p.vy) * PAN_BOUNCE;
      p.vx += panState.vx * 0.3;
      p.rotationSpeed += panState.vx * 0.01;
      
      // Check if patty settled on pan
      if (Math.abs(p.vy) < 2 && Math.abs(p.vx) < 1) {
        p.isOnPan = true;
        p.vy = 0;
        p.vx = 0;
        setGameState('aiming');
      }
    }

    // Check target collision (stacking)
    const targetCheck = checkTargetCollision(p, stack);
    if (targetCheck.onTarget && p.y + p.height / 2 >= targetCheck.restY + p.height / 2 - 10) {
      // Land on target or stack
      p.y = targetCheck.restY;
      p.vy = -Math.abs(p.vy) * BOUNCE * 0.5;
      p.vx *= GROUND_FRICTION;
      p.isOnTarget = true;
      
      // Apply stack damping
      if (Math.abs(p.vy) < 3 && Math.abs(p.vx) < 2) {
        p.vy *= STACK_DAMPING;
        p.vx *= STACK_DAMPING;
        p.rotationSpeed *= 0.8;
      }
      
      // Check if stable
      if (Math.abs(p.vy) < 0.5 && Math.abs(p.vx) < 0.5) {
        p.stableTime += 16; // ~60fps
        if (p.stableTime >= WIN_STABILITY_TIME && !p.isStacked) {
          // Patty is stacked!
          p.isStacked = true;
          p.vx = 0;
          p.vy = 0;
          
          // Add to stack
          const newStack = [...stack, p];
          stackedPattiesRef.current = newStack;
          setStackedPatties(newStack);
          
          // Check win condition
          if (newStack.length >= level.requiredPatties) {
            handleWin();
            return;
          }
          
          // Spawn next patty
          activePattyRef.current = null;
          setActivePatty(null);
          setGameState('waiting');
          return;
        }
      } else {
        p.stableTime = 0;
      }
    } else if (!panCheck.onPan) {
      p.isOnTarget = false;
      p.stableTime = 0;
    }

    // Screen bounds
    if (p.x - p.radius < 0) {
      p.x = p.radius;
      p.vx = -p.vx * BOUNCE;
    }
    if (p.x + p.radius > GAME_WIDTH) {
      p.x = GAME_WIDTH - p.radius;
      p.vx = -p.vx * BOUNCE;
    }
    
    // Fall off screen = fail
    if (p.y - p.radius > GAME_HEIGHT) {
      handleFail();
      return;
    }

    // Update stacked patties physics (tower wobble)
    const updatedStack = stack.map(sp => {
      if (sp.id === p.id) return sp;
      
      const newSp = { ...sp };
      
      // Apply micro-gravity to check stability
      newSp.vy += GRAVITY * 0.1;
      
      // Check if still on target
      const spTargetCheck = checkTargetCollision(newSp, stack.filter(s => s.id !== newSp.id));
      if (spTargetCheck.onTarget) {
        newSp.y = Math.min(newSp.y + newSp.vy, spTargetCheck.restY);
        newSp.vy *= 0.5;
      } else {
        // Fell off stack!
        newSp.y += newSp.vy;
        if (newSp.y > GAME_HEIGHT) {
          // Remove from stack
          return null;
        }
      }
      
      return newSp;
    }).filter(Boolean) as Patty[];
    
    if (updatedStack.length !== stack.length) {
      stackedPattiesRef.current = updatedStack;
      setStackedPatties(updatedStack);
    }

    activePattyRef.current = p;
    setActivePatty(p);
  }, [gameState, GAME_WIDTH, GAME_HEIGHT, level, checkPanCollision, checkTargetCollision]);

  // Game loop
  useEffect(() => {
    if (gameState === 'playing' || gameState === 'aiming') {
      const loop = () => {
        updatePhysics();
        gameLoopRef.current = requestAnimationFrame(loop);
      };
      gameLoopRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, updatePhysics]);

  const handleWin = useCallback(() => {
    setGameState('win');
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    setTimeout(() => {
      nextLevel();
    }, 2000);
  }, []);

  const handleFail = useCallback(() => {
    setGameState('fail');
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    setTimeout(() => {
      // Spawn new patty, keep stack
      activePattyRef.current = null;
      setActivePatty(null);
      setGameState('waiting');
    }, 1200);
  }, []);

  const restartLevel = useCallback(() => {
    setActivePatty(null);
    activePattyRef.current = null;
    setStackedPatties([]);
    stackedPattiesRef.current = [];
    const newPan = {
      x: level.panStartX,
      y: GAME_HEIGHT * 0.55,
      width: 130,
      height: 28,
      tilt: 0,
      vx: 0,
    };
    setPan(newPan);
    panRef.current = newPan;
    setGameState('waiting');
    setIsAiming(false);
    setAimStart(null);
    setAimEnd(null);
  }, [level.panStartX, GAME_HEIGHT]);

  const nextLevel = useCallback(() => {
    if (currentLevel < TOTAL_LEVELS - 1) {
      setCurrentLevel(currentLevel + 1);
    } else {
      setCurrentLevel(0);
    }
    setActivePatty(null);
    activePattyRef.current = null;
    setStackedPatties([]);
    stackedPattiesRef.current = [];
    setGameState('waiting');
    setIsAiming(false);
  }, [currentLevel]);

  // Launch patty from pan
  const launchPatty = useCallback((direction: Point, power: number) => {
    if (!activePattyRef.current || !activePattyRef.current.isOnPan) return;
    
    const p = { ...activePattyRef.current };
    p.isOnPan = false;
    p.vx = direction.x * power * LAUNCH_POWER_MULTIPLIER;
    p.vy = direction.y * power * LAUNCH_POWER_MULTIPLIER - 8; // Add upward boost
    p.rotationSpeed = direction.x * 0.05;
    
    activePattyRef.current = p;
    setActivePatty(p);
    setGameState('playing');
    setIsAiming(false);
    setAimStart(null);
    setAimEnd(null);
  }, []);

  // Touch handlers
  const onTouchStart = useCallback((e: any) => {
    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;
    
    // If patty is on pan, start aiming
    if (gameState === 'aiming' && activePattyRef.current?.isOnPan) {
      setAimStart({ x, y });
      setAimEnd({ x, y });
      isDraggingRef.current = false;
      return;
    }
    
    // Otherwise, move pan
    isDraggingRef.current = true;
    lastTouchXRef.current = x;
    
    // Start game on first touch
    if (gameState === 'waiting') {
      spawnPatty();
    }
  }, [gameState, spawnPatty]);

  const onTouchMove = useCallback((e: any) => {
    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;
    
    // If aiming, update aim vector
    if (aimStart && gameState === 'aiming') {
      setAimEnd({ x, y });
      return;
    }
    
    // Move pan
    if (!isDraggingRef.current) return;
    
    const deltaX = x - lastTouchXRef.current;
    lastTouchXRef.current = x;
    
    const newPan = { ...panRef.current };
    newPan.vx = deltaX * 0.8;
    newPan.x = Math.max(newPan.width / 2, Math.min(GAME_WIDTH - newPan.width / 2, newPan.x + deltaX));
    newPan.tilt = Math.max(-1, Math.min(1, deltaX / 15));
    
    panRef.current = newPan;
    setPan(newPan);
  }, [aimStart, gameState, GAME_WIDTH]);

  const onTouchEnd = useCallback(() => {
    // If was aiming, launch
    if (aimStart && aimEnd && gameState === 'aiming') {
      const dx = aimStart.x - aimEnd.x;
      const dy = aimStart.y - aimEnd.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 20) {
        const power = Math.min(distance, MAX_ARROW_LENGTH);
        const direction = { x: dx / distance, y: dy / distance };
        launchPatty(direction, power);
      }
      
      setAimStart(null);
      setAimEnd(null);
      return;
    }
    
    isDraggingRef.current = false;
    const newPan = { ...panRef.current, tilt: 0, vx: 0 };
    panRef.current = newPan;
    setPan(newPan);
  }, [aimStart, aimEnd, gameState, launchPatty]);

  // Background picker
  const pickBackgroundImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setBackgroundImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  // Calculate aim arrow
  const getAimArrow = useCallback(() => {
    if (!aimStart || !aimEnd || gameState !== 'aiming') return null;
    
    const dx = aimStart.x - aimEnd.x;
    const dy = aimStart.y - aimEnd.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 10) return null;
    
    const clampedDistance = Math.min(distance, MAX_ARROW_LENGTH);
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    const patty = activePattyRef.current;
    if (!patty) return null;
    
    const startX = patty.x;
    const startY = patty.y - patty.height;
    const endX = startX + dirX * clampedDistance;
    const endY = startY + dirY * clampedDistance;
    
    // Calculate trajectory points
    const trajectoryPoints: Point[] = [];
    const launchVx = dirX * clampedDistance * LAUNCH_POWER_MULTIPLIER;
    const launchVy = dirY * clampedDistance * LAUNCH_POWER_MULTIPLIER - 8;
    
    let tx = startX;
    let ty = startY;
    let tvx = launchVx;
    let tvy = launchVy;
    
    for (let i = 0; i < 30; i++) {
      trajectoryPoints.push({ x: tx, y: ty });
      tx += tvx;
      ty += tvy;
      tvy += GRAVITY;
      if (ty > GAME_HEIGHT) break;
    }
    
    return {
      startX,
      startY,
      endX,
      endY,
      power: clampedDistance / MAX_ARROW_LENGTH,
      trajectory: trajectoryPoints,
    };
  }, [aimStart, aimEnd, gameState, GAME_HEIGHT]);

  // Render patty
  const renderPatty = (p: Patty, isStacked: boolean = false) => {
    const baseColor = isStacked 
      ? `rgb(${160 + Math.random() * 20}, ${80}, ${40})`
      : `rgb(${150}, ${85}, ${45})`;
    
    return (
      <G key={p.id} transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation * 180 / Math.PI})`}>
        {/* Shadow */}
        <Ellipse
          cx={0}
          cy={p.height + 10}
          rx={p.radius * 0.85}
          ry={p.height * 0.5}
          fill="rgba(0,0,0,0.2)"
        />
        {/* Patty body - elliptical */}
        <Ellipse
          cx={0}
          cy={0}
          rx={p.radius}
          ry={p.height}
          fill={baseColor}
        />
        {/* Texture spots */}
        <Ellipse cx={-18} cy={-6} rx={8} ry={5} fill="rgba(90, 50, 30, 0.5)" />
        <Ellipse cx={15} cy={-3} rx={7} ry={4} fill="rgba(90, 50, 30, 0.5)" />
        <Ellipse cx={0} cy={8} rx={9} ry={5} fill="rgba(90, 50, 30, 0.4)" />
        <Ellipse cx={22} cy={5} rx={6} ry={4} fill="rgba(90, 50, 30, 0.4)" />
        <Ellipse cx={-12} cy={10} rx={7} ry={4} fill="rgba(90, 50, 30, 0.35)" />
        {/* Highlight */}
        <Ellipse cx={-12} cy={-10} rx={12} ry={6} fill="rgba(255,255,255,0.12)" />
        {/* Stable indicator */}
        {p.stableTime > 500 && (
          <Circle cx={0} cy={-p.height - 10} r={5} fill="#4CAF50" opacity={0.8} />
        )}
      </G>
    );
  };

  // Render pan (HANDLE ON LEFT SIDE - FIXED)
  const renderPan = () => {
    const tiltAngle = pan.tilt * 10;
    
    return (
      <G transform={`translate(${pan.x}, ${pan.y}) rotate(${tiltAngle})`}>
        {/* Pan shadow */}
        <Ellipse
          cx={0}
          cy={pan.height + 8}
          rx={pan.width / 2 + 8}
          ry={10}
          fill="rgba(0,0,0,0.25)"
        />
        {/* Handle - NOW ON LEFT SIDE */}
        <Rect
          x={-pan.width / 2 - 55}
          y={-10}
          width={60}
          height={20}
          rx={10}
          fill="#5D4037"
        />
        <Rect
          x={-pan.width / 2 - 50}
          y={-6}
          width={52}
          height={12}
          rx={6}
          fill="#795548"
        />
        {/* Pan body */}
        <Ellipse
          cx={0}
          cy={0}
          rx={pan.width / 2}
          ry={pan.height}
          fill="#3A3A3A"
        />
        {/* Pan inner surface */}
        <Ellipse
          cx={0}
          cy={3}
          rx={pan.width / 2 - 10}
          ry={pan.height - 6}
          fill="#2A2A2A"
        />
        {/* Pan highlight */}
        <Ellipse
          cx={15}
          cy={-8}
          rx={30}
          ry={10}
          fill="rgba(255,255,255,0.08)"
        />
        {/* Pan rim */}
        <Ellipse
          cx={0}
          cy={-pan.height + 5}
          rx={pan.width / 2 - 2}
          ry={5}
          fill="#4A4A4A"
        />
      </G>
    );
  };

  // Render dispenser
  const renderDispenser = () => {
    return (
      <G>
        {/* Machine body */}
        <Rect
          x={level.dispenserX - 55}
          y={level.dispenserY - 50}
          width={110}
          height={100}
          rx={14}
          fill="#E8E8E8"
          stroke="#BDBDBD"
          strokeWidth={3}
        />
        {/* Dispenser opening */}
        <Rect
          x={level.dispenserX - 30}
          y={level.dispenserY + 40}
          width={60}
          height={20}
          fill="#1A1A1A"
        />
        {/* Machine buttons */}
        <Circle cx={level.dispenserX - 30} cy={level.dispenserY - 25} r={12} fill="#FF5252" />
        <Circle cx={level.dispenserX} cy={level.dispenserY - 25} r={12} fill="#4CAF50" />
        <Circle cx={level.dispenserX + 30} cy={level.dispenserY - 25} r={12} fill="#FFC107" />
        {/* Display */}
        <Rect
          x={level.dispenserX - 40}
          y={level.dispenserY + 5}
          width={80}
          height={30}
          rx={4}
          fill="#1A237E"
        />
        <Text
          x={level.dispenserX}
          y={level.dispenserY + 25}
          textAnchor="middle"
          fill="#00E676"
          fontSize={14}
          fontWeight="bold"
        >
          {stackedPatties.length}/{level.requiredPatties}
        </Text>
      </G>
    );
  };

  // Render target (bun/plate) - STATIC PLATFORM
  const renderTarget = () => {
    const target = level.target;
    return (
      <G>
        {/* Plate shadow */}
        <Ellipse
          cx={target.x + target.width / 2}
          cy={target.y + target.height + 5}
          rx={target.width / 2 + 15}
          ry={12}
          fill="rgba(0,0,0,0.2)"
        />
        {/* Plate */}
        <Ellipse
          cx={target.x + target.width / 2}
          cy={target.y + target.height - 8}
          rx={target.width / 2 + 12}
          ry={18}
          fill="#ECEFF1"
          stroke="#B0BEC5"
          strokeWidth={2}
        />
        {/* Bun bottom - this is the collision surface */}
        <Rect
          x={target.x}
          y={target.y}
          width={target.width}
          height={target.height}
          rx={12}
          fill="#D4A574"
        />
        {/* Bun top curve */}
        <Ellipse
          cx={target.x + target.width / 2}
          cy={target.y + 5}
          rx={target.width / 2 - 5}
          ry={15}
          fill="#DEB887"
        />
        {/* Sesame seeds */}
        <Ellipse cx={target.x + 25} cy={target.y + 15} rx={6} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 55} cy={target.y + 20} rx={6} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 85} cy={target.y + 12} rx={6} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 40} cy={target.y + 32} rx={6} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 72} cy={target.y + 38} rx={6} ry={3} fill="#F5F5DC" />
        {/* Lettuce hint */}
        <Path
          d={`M ${target.x + 8} ${target.y + 8} Q ${target.x + 30} ${target.y - 8} ${target.x + 55} ${target.y + 8} Q ${target.x + 80} ${target.y - 8} ${target.x + 102} ${target.y + 8}`}
          fill="none"
          stroke="#66BB6A"
          strokeWidth={5}
        />
      </G>
    );
  };

  // Render aim arrow
  const renderAimArrow = () => {
    const arrow = getAimArrow();
    if (!arrow) return null;
    
    const powerColor = arrow.power < 0.3 ? '#4CAF50' : arrow.power < 0.7 ? '#FFC107' : '#FF5252';
    
    return (
      <G>
        {/* Trajectory dots */}
        {arrow.trajectory.map((point, i) => (
          <Circle
            key={`traj-${i}`}
            cx={point.x}
            cy={point.y}
            r={3}
            fill={powerColor}
            opacity={1 - i * 0.03}
          />
        ))}
        {/* Main arrow line */}
        <Line
          x1={arrow.startX}
          y1={arrow.startY}
          x2={arrow.endX}
          y2={arrow.endY}
          stroke={powerColor}
          strokeWidth={4}
          strokeLinecap="round"
        />
        {/* Arrow head */}
        <G transform={`translate(${arrow.endX}, ${arrow.endY}) rotate(${Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX) * 180 / Math.PI})`}>
          <Polygon
            points="0,0 -15,-8 -15,8"
            fill={powerColor}
          />
        </G>
        {/* Power indicator */}
        <Circle
          cx={arrow.startX}
          cy={arrow.startY - 30}
          r={15}
          fill="rgba(0,0,0,0.5)"
        />
        <Text
          x={arrow.startX}
          y={arrow.startY - 26}
          textAnchor="middle"
          fill="white"
          fontSize={12}
          fontWeight="bold"
        >
          {Math.round(arrow.power * 100)}%
        </Text>
      </G>
    );
  };

  // Settings Modal
  const renderSettingsModal = () => (
    <Modal
      visible={showSettings}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSettings(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Settings</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.settingsScroll}>
            {/* Background Section */}
            <Text style={styles.sectionTitle}>Background</Text>
            
            {/* Built-in backgrounds */}
            <View style={styles.backgroundGrid}>
              {BUILT_IN_BACKGROUNDS.map((bg) => (
                <TouchableOpacity
                  key={bg.id}
                  style={[
                    styles.backgroundOption,
                    { backgroundColor: bg.color },
                    backgroundColor === bg.color && !backgroundImage && styles.backgroundSelected,
                  ]}
                  onPress={() => {
                    setBackgroundImage(null);
                    setBackgroundColor(bg.color);
                  }}
                >
                  <Text style={styles.backgroundOptionText}>{bg.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Upload custom */}
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={pickBackgroundImage}
            >
              <Ionicons name="image-outline" size={24} color="white" />
              <Text style={styles.uploadButtonText}>Upload Custom Background</Text>
            </TouchableOpacity>
            
            {backgroundImage && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setBackgroundImage(null)}
              >
                <Ionicons name="trash-outline" size={20} color="#FF5252" />
                <Text style={styles.clearButtonText}>Remove Custom Background</Text>
              </TouchableOpacity>
            )}
            
            {/* Fit mode */}
            <Text style={styles.subsectionTitle}>Fit Mode</Text>
            <View style={styles.fitModeRow}>
              <TouchableOpacity
                style={[styles.fitModeButton, backgroundMode === 'fill' && styles.fitModeActive]}
                onPress={() => setBackgroundMode('fill')}
              >
                <Text style={[styles.fitModeText, backgroundMode === 'fill' && styles.fitModeTextActive]}>Fill</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fitModeButton, backgroundMode === 'fit' && styles.fitModeActive]}
                onPress={() => setBackgroundMode('fit')}
              >
                <Text style={[styles.fitModeText, backgroundMode === 'fit' && styles.fitModeTextActive]}>Fit</Text>
              </TouchableOpacity>
            </View>
            
            {/* Brightness */}
            <Text style={styles.subsectionTitle}>Background Brightness</Text>
            <View style={styles.sliderRow}>
              <Ionicons name="sunny-outline" size={20} color="#666" />
              <View style={styles.sliderContainer}>
                {Platform.OS === 'web' ? (
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.05"
                    value={backgroundBrightness}
                    onChange={(e) => setBackgroundBrightness(parseFloat(e.target.value))}
                    style={{ width: '100%', height: 40 }}
                  />
                ) : (
                  <Slider
                    style={{ flex: 1, height: 40 }}
                    minimumValue={0.2}
                    maximumValue={1}
                    value={backgroundBrightness}
                    onValueChange={setBackgroundBrightness}
                    minimumTrackTintColor="#4CAF50"
                    maximumTrackTintColor="#E0E0E0"
                  />
                )}
              </View>
              <Ionicons name="sunny" size={24} color="#FFC107" />
            </View>
            
            {/* Game controls */}
            <Text style={styles.sectionTitle}>Game</Text>
            <TouchableOpacity
              style={styles.gameButton}
              onPress={() => {
                restartLevel();
                setShowSettings(false);
              }}
            >
              <Ionicons name="reload" size={22} color="white" />
              <Text style={styles.gameButtonText}>Restart Level</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.gameButton, { backgroundColor: '#FF9800' }]}
              onPress={() => {
                setCurrentLevel(0);
                restartLevel();
                setShowSettings(false);
              }}
            >
              <Ionicons name="home" size={22} color="white" />
              <Text style={styles.gameButtonText}>Back to Level 1</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Background */}
      {backgroundImage ? (
        <View style={styles.backgroundContainer}>
          <Image
            source={{ uri: backgroundImage }}
            style={[
              styles.backgroundImage,
              { resizeMode: backgroundMode === 'fill' ? 'cover' : 'contain' }
            ]}
          />
          <View style={[styles.backgroundDim, { opacity: 1 - backgroundBrightness }]} />
        </View>
      ) : (
        <View style={[styles.defaultBackground, { backgroundColor }]}>
          <View style={[styles.backgroundDim, { opacity: 1 - backgroundBrightness }]} />
        </View>
      )}

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
          {/* Game objects */}
          {renderDispenser()}
          {renderTarget()}
          {renderPan()}
          
          {/* Stacked patties */}
          {stackedPatties.map(p => renderPatty(p, true))}
          
          {/* Active patty */}
          {activePatty && renderPatty(activePatty, false)}
          
          {/* Aim arrow */}
          {renderAimArrow()}
        </Svg>
      </View>

      {/* UI Overlay */}
      <View style={styles.uiOverlay}>
        <View style={styles.levelContainer}>
          <Text style={styles.levelText}>Level {currentLevel + 1}</Text>
          <Text style={styles.stackText}>{stackedPatties.length}/{level.requiredPatties}</Text>
        </View>
        
        <TouchableOpacity
          style={styles.resetButton}
          onPress={restartLevel}
        >
          <Ionicons name="reload" size={22} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setShowSettings(true)}
        >
          <Ionicons name="settings-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      {gameState === 'waiting' && stackedPatties.length === 0 && (
        <View style={styles.instructionsOverlay} pointerEvents="none">
          <MaterialCommunityIcons name="pan" size={48} color="white" />
          <Text style={styles.instructionsText}>Catch & Stack!</Text>
          <Text style={styles.instructionsSubtext}>Drag pan to catch, then aim & launch</Text>
        </View>
      )}

      {/* Aiming hint */}
      {gameState === 'aiming' && (
        <View style={styles.aimHint} pointerEvents="none">
          <Text style={styles.aimHintText}>Drag to aim, release to launch!</Text>
        </View>
      )}

      {/* Win overlay */}
      {gameState === 'win' && (
        <View style={styles.resultOverlay}>
          <Text style={styles.winText}>Perfect Stack!</Text>
          <Text style={styles.resultSubtext}>{level.requiredPatties} patties stacked!</Text>
        </View>
      )}
      
      {/* Fail overlay */}
      {gameState === 'fail' && (
        <View style={styles.resultOverlay}>
          <Text style={styles.failText}>Oops!</Text>
          <Text style={styles.resultSubtext}>Keep trying...</Text>
        </View>
      )}

      {renderSettingsModal()}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  defaultBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  backgroundDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelContainer: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  levelText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stackText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    borderRadius: 25,
    marginLeft: 'auto',
    marginRight: 10,
  },
  settingsButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    borderRadius: 25,
  },
  instructionsOverlay: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionsText: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  instructionsSubtext: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  aimHint: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  aimHintText: {
    color: '#FFC107',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  winText: {
    color: '#4CAF50',
    fontSize: 48,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
  failText: {
    color: '#FF5252',
    fontSize: 48,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
  resultSubtext: {
    color: 'white',
    fontSize: 20,
    marginTop: 10,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsScroll: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  backgroundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  backgroundOption: {
    width: '47%',
    height: 70,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  backgroundSelected: {
    borderColor: '#4CAF50',
  },
  backgroundOptionText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    gap: 10,
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  clearButtonText: {
    color: '#FF5252',
    fontSize: 14,
  },
  fitModeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fitModeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  fitModeActive: {
    backgroundColor: '#4CAF50',
  },
  fitModeText: {
    fontWeight: '600',
    color: '#666',
  },
  fitModeTextActive: {
    color: 'white',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sliderContainer: {
    flex: 1,
  },
  gameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    gap: 10,
  },
  gameButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
