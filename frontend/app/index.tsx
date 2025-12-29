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
import Svg, { Path, Circle, Rect, G, Ellipse, Line, Polygon, Defs, LinearGradient, Stop } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

// Physics constants
const GRAVITY = 0.55;
const AIR_FRICTION = 0.995;
const BOUNCE = 0.4;
const PAN_BOUNCE = 0.5;
const PATTY_RADIUS = 42;
const PATTY_HEIGHT = 20;
const SPAWN_DELAY = 1000;
const MAX_ARROW_LENGTH = 160;
const LAUNCH_POWER_MULTIPLIER = 0.18;

// Built-in backgrounds
const BUILT_IN_BACKGROUNDS = [
  { id: 'kitchen', name: 'Kitchen', color: '#8B5A2B' },
  { id: 'restaurant', name: 'Restaurant', color: '#4A3728' },
  { id: 'industrial', name: 'Industrial', color: '#37474F' },
  { id: 'night', name: 'Night Shift', color: '#1A1A2E' },
];

// Level configurations
const LEVEL_CONFIGS = [
  { requiredPatties: 2, binYOffset: 0 },      // Level 1: bottom
  { requiredPatties: 3, binYOffset: -50 },    // Level 2: slightly higher
  { requiredPatties: 4, binYOffset: -100 },   // Level 3: mid-low
  { requiredPatties: 5, binYOffset: -160 },   // Level 4: mid
  { requiredPatties: 7, binYOffset: -220 },   // Level 5: high
];

// ==================== ITEM MODULE SYSTEM ====================
interface ItemConfig {
  id: string;
  name: string;
  icon: string;
  iconFamily: 'MaterialCommunityIcons' | 'Ionicons';
  radius: number;
  height: number;
  mass: number;       // Affects physics
  bounce: number;     // Item-specific bounce
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

const ITEM_CONFIGS: ItemConfig[] = [
  {
    id: 'patty',
    name: 'Spoiled Patty',
    icon: 'hamburger',
    iconFamily: 'MaterialCommunityIcons',
    radius: 42,
    height: 20,
    mass: 1.0,
    bounce: 0.4,
    colors: { primary: '#6B5344', secondary: 'rgba(80, 100, 60, 0.4)', accent: 'rgba(60, 45, 35, 0.5)' },
  },
  {
    id: 'money',
    name: 'Money Stack',
    icon: 'cash',
    iconFamily: 'MaterialCommunityIcons',
    radius: 38,
    height: 18,
    mass: 0.7,
    bounce: 0.3,
    colors: { primary: '#2E7D32', secondary: '#1B5E20', accent: '#A5D6A7' },
  },
  {
    id: 'poop',
    name: 'Cartoon Poop',
    icon: 'emoticon-poop',
    iconFamily: 'MaterialCommunityIcons',
    radius: 40,
    height: 35,
    mass: 0.8,
    bounce: 0.5,
    colors: { primary: '#5D4037', secondary: '#3E2723', accent: '#8D6E63' },
  },
  {
    id: 'teddy',
    name: 'Teddy Bear',
    icon: 'teddy-bear',
    iconFamily: 'MaterialCommunityIcons',
    radius: 44,
    height: 40,
    mass: 0.6,
    bounce: 0.6,
    colors: { primary: '#A1887F', secondary: '#8D6E63', accent: '#D7CCC8' },
  },
  {
    id: 'phone',
    name: 'Broken Phone',
    icon: 'cellphone',
    iconFamily: 'MaterialCommunityIcons',
    radius: 35,
    height: 50,
    mass: 1.1,
    bounce: 0.25,
    colors: { primary: '#37474F', secondary: '#263238', accent: '#78909C' },
  },
];

// ==================== TARGET MODULE SYSTEM ====================
interface TargetConfig {
  id: string;
  name: string;
  icon: string;
  iconFamily: 'MaterialCommunityIcons' | 'Ionicons';
  openingWidthRatio: number;  // Relative to target width
  description: string;
}

const TARGET_CONFIGS: TargetConfig[] = [
  {
    id: 'trashbin',
    name: 'Trash Bin',
    icon: 'delete',
    iconFamily: 'MaterialCommunityIcons',
    openingWidthRatio: 0.68,
    description: 'Standard disposal',
  },
  {
    id: 'toilet',
    name: 'Toilet',
    icon: 'toilet',
    iconFamily: 'MaterialCommunityIcons',
    openingWidthRatio: 0.6,
    description: 'Flush it away',
  },
  {
    id: 'mouth',
    name: 'Big Mouth',
    icon: 'emoticon-excited',
    iconFamily: 'MaterialCommunityIcons',
    openingWidthRatio: 0.7,
    description: 'Feed the hungry',
  },
  {
    id: 'pig',
    name: 'Hungry Pig',
    icon: 'pig',
    iconFamily: 'MaterialCommunityIcons',
    openingWidthRatio: 0.65,
    description: 'Oink oink!',
  },
  {
    id: 'blackhole',
    name: 'Black Hole',
    icon: 'blur-radial',
    iconFamily: 'MaterialCommunityIcons',
    openingWidthRatio: 0.75,
    description: 'Into the void',
  },
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
  isDisposed: boolean;
}

interface Pan {
  x: number;
  y: number;
  width: number;
  height: number;
  tilt: number;
  vx: number;
}

interface TrashBin {
  x: number;
  y: number;
  width: number;
  height: number;
  openingWidth: number;
  openingY: number;
}

const TOTAL_LEVELS = 5;

export default function PattyDisposalGame() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const GAME_WIDTH = windowWidth;
  const GAME_HEIGHT = windowHeight;

  const [currentLevel, setCurrentLevel] = useState(0);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'aiming' | 'win' | 'fail'>('waiting');
  const [activePatty, setActivePatty] = useState<Patty | null>(null);
  const [disposedCount, setDisposedCount] = useState(0);
  const [pan, setPan] = useState<Pan>({
    x: GAME_WIDTH * 0.35,
    y: GAME_HEIGHT * 0.5,
    width: 130,
    height: 28,
    tilt: 0,
    vx: 0,
  });
  
  // Aiming system
  const [aimStart, setAimStart] = useState<Point | null>(null);
  const [aimEnd, setAimEnd] = useState<Point | null>(null);
  
  // Background settings
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState('#37474F');
  const [backgroundMode, setBackgroundMode] = useState<'fill' | 'fit'>('fill');
  const [backgroundBrightness, setBackgroundBrightness] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  
  // Mod selection (Item & Target)
  const [selectedItem, setSelectedItem] = useState<string>('patty');
  const [selectedTarget, setSelectedTarget] = useState<string>('trashbin');
  const [showMods, setShowMods] = useState(false);
  
  // Get current item and target configs
  const currentItem = ITEM_CONFIGS.find(i => i.id === selectedItem) || ITEM_CONFIGS[0];
  const currentTarget = TARGET_CONFIGS.find(t => t.id === selectedTarget) || TARGET_CONFIGS[0];
  
  // Refs
  const gameLoopRef = useRef<number | null>(null);
  const activePattyRef = useRef<Patty | null>(null);
  const panRef = useRef<Pan>(pan);
  const isDraggingRef = useRef(false);
  const lastTouchXRef = useRef(0);
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const disposedCountRef = useRef(0);

  // Get current level config
  const levelConfig = LEVEL_CONFIGS[currentLevel] || LEVEL_CONFIGS[0];

  // Calculate target position based on level (uses selected target's opening width)
  const getTargetPosition = useCallback((): TrashBin => {
    const baseY = GAME_HEIGHT - 180;
    const binWidth = 100;
    const binHeight = 120;
    const openingWidth = binWidth * currentTarget.openingWidthRatio;
    
    return {
      x: GAME_WIDTH * 0.75 - binWidth / 2,
      y: baseY + levelConfig.binYOffset,
      width: binWidth,
      height: binHeight,
      openingWidth: openingWidth,
      openingY: baseY + levelConfig.binYOffset,
    };
  }, [GAME_WIDTH, GAME_HEIGHT, levelConfig.binYOffset, currentTarget.openingWidthRatio]);

  const targetPosition = getTargetPosition();

  // Initialize pan position
  useEffect(() => {
    const newPan = {
      x: GAME_WIDTH * 0.35,
      y: GAME_HEIGHT * 0.5,
      width: 130,
      height: 28,
      tilt: 0,
      vx: 0,
    };
    setPan(newPan);
    panRef.current = newPan;
    setDisposedCount(0);
    disposedCountRef.current = 0;
  }, [currentLevel, GAME_WIDTH, GAME_HEIGHT]);

  // Spawn patty from dispenser
  const spawnPatty = useCallback(() => {
    const dispenserX = GAME_WIDTH * 0.5;
    const dispenserY = 80;
    
    const newPatty: Patty = {
      id: Date.now().toString(),
      x: dispenserX,
      y: dispenserY + 60,
      vx: (Math.random() - 0.5) * 2,
      vy: 3,
      radius: currentItem.radius,
      height: currentItem.height,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.08,
      isOnPan: false,
      isDisposed: false,
    };
    activePattyRef.current = newPatty;
    setActivePatty(newPatty);
    setGameState('playing');
    setAimStart(null);
    setAimEnd(null);
  }, [GAME_WIDTH, currentItem]);

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
    
    if (p.x + p.radius < panLeft || p.x - p.radius > panRight) {
      return { onPan: false, collision: false };
    }
    
    const relativeX = (p.x - panState.x) / (panState.width / 2);
    const panSurfaceY = panTop - tiltOffset * relativeX;
    
    const pattyBottom = p.y + p.height / 2;
    const distToSurface = pattyBottom - panSurfaceY;
    
    if (distToSurface > -5 && distToSurface < p.height && p.vy >= 0) {
      return { onPan: true, collision: distToSurface > 0 };
    }
    
    return { onPan: false, collision: false };
  }, []);

  // Check trash bin collision
  const checkTrashBinCollision = useCallback((p: Patty): 'inside' | 'side' | 'none' => {
    const bin = targetPosition;
    const binLeft = bin.x;
    const binRight = bin.x + bin.width;
    const binTop = bin.openingY;
    const binBottom = bin.y + bin.height;
    const openingLeft = bin.x + (bin.width - bin.openingWidth) / 2;
    const openingRight = openingLeft + bin.openingWidth;
    const binCenterX = bin.x + bin.width / 2;
    
    // Check if patty center is within the opening zone (more forgiving)
    const inOpeningX = p.x > openingLeft - 5 && p.x < openingRight + 5;
    const pastOpeningY = p.y > binTop + 10;
    const withinBinDepth = p.y < binBottom - 10;
    
    // Success: Patty went through opening and is inside bin
    if (inOpeningX && pastOpeningY && withinBinDepth && p.vy > 0) {
      return 'inside';
    }
    
    // Check side/rim collisions
    const pattyInBinX = p.x + p.radius > binLeft && p.x - p.radius < binRight;
    const pattyNearBinY = p.y > binTop - p.height && p.y < binBottom;
    
    if (pattyInBinX && pattyNearBinY) {
      // Hit left wall
      if (p.x - p.radius < binLeft + 12 && p.x > binLeft - p.radius) {
        return 'side';
      }
      // Hit right wall
      if (p.x + p.radius > binRight - 12 && p.x < binRight + p.radius) {
        return 'side';
      }
      // Hit left rim of opening
      if (p.x > binLeft && p.x < openingLeft + 5 && p.y < binTop + 25) {
        return 'side';
      }
      // Hit right rim of opening
      if (p.x > openingRight - 5 && p.x < binRight && p.y < binTop + 25) {
        return 'side';
      }
    }
    
    return 'none';
  }, [targetPosition]);

  // Physics update
  const updatePhysics = useCallback(() => {
    if (!activePattyRef.current || (gameState !== 'playing' && gameState !== 'aiming')) return;

    const p = { ...activePattyRef.current };
    const panState = panRef.current;
    
    // Skip physics if aiming (patty stays on pan)
    if (gameState === 'aiming' && p.isOnPan) {
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
    if (panCheck.collision && !p.isDisposed) {
      const panTop = panState.y - panState.height / 2;
      const tiltOffset = panState.tilt * 12;
      const relativeX = (p.x - panState.x) / (panState.width / 2);
      const panSurfaceY = panTop - tiltOffset * relativeX;
      
      p.y = panSurfaceY - p.height / 2 - 2;
      p.vy = -Math.abs(p.vy) * PAN_BOUNCE;
      p.vx += panState.vx * 0.4;
      p.rotationSpeed += panState.vx * 0.01;
      
      // Check if patty settled on pan
      if (Math.abs(p.vy) < 2.5 && Math.abs(p.vx) < 1.5) {
        p.isOnPan = true;
        p.vy = 0;
        p.vx = 0;
        setGameState('aiming');
      }
    }

    // Check trash bin collision
    const binCollision = checkTrashBinCollision(p);
    if (binCollision === 'inside' && !p.isDisposed) {
      // Success! Patty went in the bin
      p.isDisposed = true;
      const newCount = disposedCountRef.current + 1;
      disposedCountRef.current = newCount;
      setDisposedCount(newCount);
      
      // Check win condition
      if (newCount >= levelConfig.requiredPatties) {
        handleWin();
        return;
      }
      
      // Spawn next patty
      activePattyRef.current = null;
      setActivePatty(null);
      setGameState('waiting');
      return;
    } else if (binCollision === 'side') {
      // Bounced off side - this is a fail!
      p.vx = -p.vx * BOUNCE;
      p.vy = -p.vy * BOUNCE * 0.5;
      p.rotationSpeed = -p.rotationSpeed;
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
    
    // Patty landed on ground (missed bin) = fail
    if (p.y + p.height > GAME_HEIGHT - 20 && Math.abs(p.vy) < 2 && !p.isDisposed) {
      handleFail();
      return;
    }

    activePattyRef.current = p;
    setActivePatty(p);
  }, [gameState, GAME_WIDTH, GAME_HEIGHT, levelConfig, checkPanCollision, checkTrashBinCollision]);

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
      restartLevel();
    }, 1500);
  }, []);

  const restartLevel = useCallback(() => {
    setActivePatty(null);
    activePattyRef.current = null;
    setDisposedCount(0);
    disposedCountRef.current = 0;
    const newPan = {
      x: GAME_WIDTH * 0.35,
      y: GAME_HEIGHT * 0.5,
      width: 130,
      height: 28,
      tilt: 0,
      vx: 0,
    };
    setPan(newPan);
    panRef.current = newPan;
    setGameState('waiting');
    setAimStart(null);
    setAimEnd(null);
  }, [GAME_WIDTH, GAME_HEIGHT]);

  const nextLevel = useCallback(() => {
    if (currentLevel < TOTAL_LEVELS - 1) {
      setCurrentLevel(currentLevel + 1);
    } else {
      setCurrentLevel(0); // Loop back
    }
    setActivePatty(null);
    activePattyRef.current = null;
    setDisposedCount(0);
    disposedCountRef.current = 0;
    setGameState('waiting');
    setAimStart(null);
    setAimEnd(null);
  }, [currentLevel]);

  // Launch patty from pan
  const launchPatty = useCallback((direction: Point, power: number) => {
    if (!activePattyRef.current || !activePattyRef.current.isOnPan) return;
    
    const p = { ...activePattyRef.current };
    p.isOnPan = false;
    p.vx = direction.x * power * LAUNCH_POWER_MULTIPLIER;
    p.vy = direction.y * power * LAUNCH_POWER_MULTIPLIER - 6;
    p.rotationSpeed = direction.x * 0.06;
    
    activePattyRef.current = p;
    setActivePatty(p);
    setGameState('playing');
    setAimStart(null);
    setAimEnd(null);
  }, []);

  // Touch handlers
  const onTouchStart = useCallback((e: any) => {
    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;
    
    if (gameState === 'aiming' && activePattyRef.current?.isOnPan) {
      setAimStart({ x, y });
      setAimEnd({ x, y });
      isDraggingRef.current = false;
      return;
    }
    
    isDraggingRef.current = true;
    lastTouchXRef.current = x;
    
    if (gameState === 'waiting') {
      spawnPatty();
    }
  }, [gameState, spawnPatty]);

  const onTouchMove = useCallback((e: any) => {
    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;
    
    if (aimStart && gameState === 'aiming') {
      setAimEnd({ x, y });
      return;
    }
    
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
    if (aimStart && aimEnd && gameState === 'aiming') {
      const dx = aimStart.x - aimEnd.x;
      const dy = aimStart.y - aimEnd.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 25) {
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
    
    if (distance < 15) return null;
    
    const clampedDistance = Math.min(distance, MAX_ARROW_LENGTH);
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    const patty = activePattyRef.current;
    if (!patty) return null;
    
    const startX = patty.x;
    const startY = patty.y - patty.height;
    const endX = startX + dirX * clampedDistance;
    const endY = startY + dirY * clampedDistance;
    
    // Trajectory preview
    const trajectoryPoints: Point[] = [];
    const launchVx = dirX * clampedDistance * LAUNCH_POWER_MULTIPLIER;
    const launchVy = dirY * clampedDistance * LAUNCH_POWER_MULTIPLIER - 6;
    
    let tx = startX;
    let ty = startY;
    let tvx = launchVx;
    let tvy = launchVy;
    
    for (let i = 0; i < 35; i++) {
      trajectoryPoints.push({ x: tx, y: ty });
      tx += tvx;
      ty += tvy;
      tvy += GRAVITY;
      if (ty > GAME_HEIGHT || tx < 0 || tx > GAME_WIDTH) break;
    }
    
    return {
      startX,
      startY,
      endX,
      endY,
      power: clampedDistance / MAX_ARROW_LENGTH,
      trajectory: trajectoryPoints,
    };
  }, [aimStart, aimEnd, gameState, GAME_HEIGHT, GAME_WIDTH]);

  // Render item based on selected item type
  const renderItem = () => {
    if (!activePatty) return null;
    
    const p = activePatty;
    const item = currentItem;
    
    return (
      <G transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation * 180 / Math.PI})`}>
        {/* Shadow */}
        <Ellipse
          cx={0}
          cy={p.height + 12}
          rx={p.radius * 0.85}
          ry={p.height * 0.5}
          fill="rgba(0,0,0,0.25)"
        />
        
        {/* Item-specific rendering */}
        {item.id === 'patty' && (
          <>
            <Ellipse cx={0} cy={0} rx={p.radius} ry={p.height} fill={item.colors.primary} />
            <Ellipse cx={-15} cy={-5} rx={10} ry={6} fill={item.colors.secondary} />
            <Ellipse cx={12} cy={-2} rx={8} ry={5} fill={item.colors.secondary} />
            <Ellipse cx={-5} cy={8} rx={12} ry={6} fill={item.colors.secondary} />
            <Ellipse cx={20} cy={6} rx={7} ry={4} fill={item.colors.secondary} />
            <Ellipse cx={-10} cy={-10} rx={10} ry={5} fill="rgba(255,255,255,0.08)" />
          </>
        )}
        
        {item.id === 'money' && (
          <>
            <Rect x={-p.radius} y={-p.height} width={p.radius * 2} height={p.height * 2} rx={4} fill={item.colors.primary} />
            <Rect x={-p.radius + 3} y={-p.height + 3} width={p.radius * 2 - 6} height={p.height * 2 - 6} rx={2} fill={item.colors.secondary} />
            <Circle cx={0} cy={0} r={p.radius * 0.4} fill={item.colors.accent} />
            <Text x={0} y={5} textAnchor="middle" fill={item.colors.secondary} fontSize={16} fontWeight="bold">$</Text>
            <Rect x={-p.radius + 5} y={-p.height + 6} width={8} height={4} fill={item.colors.accent} />
            <Rect x={p.radius - 13} y={p.height - 10} width={8} height={4} fill={item.colors.accent} />
          </>
        )}
        
        {item.id === 'poop' && (
          <>
            {/* Poop swirl shape */}
            <Ellipse cx={0} cy={p.height * 0.3} rx={p.radius * 0.9} ry={p.height * 0.4} fill={item.colors.primary} />
            <Ellipse cx={0} cy={-p.height * 0.1} rx={p.radius * 0.7} ry={p.height * 0.35} fill={item.colors.primary} />
            <Ellipse cx={0} cy={-p.height * 0.45} rx={p.radius * 0.5} ry={p.height * 0.3} fill={item.colors.primary} />
            <Ellipse cx={0} cy={-p.height * 0.7} rx={p.radius * 0.25} ry={p.height * 0.2} fill={item.colors.primary} />
            {/* Eyes */}
            <Circle cx={-10} cy={-5} r={6} fill="white" />
            <Circle cx={10} cy={-5} r={6} fill="white" />
            <Circle cx={-8} cy={-4} r={3} fill="#333" />
            <Circle cx={12} cy={-4} r={3} fill="#333" />
            {/* Highlight */}
            <Ellipse cx={-15} cy={-p.height * 0.3} rx={5} ry={3} fill={item.colors.accent} opacity={0.5} />
          </>
        )}
        
        {item.id === 'teddy' && (
          <>
            {/* Body */}
            <Ellipse cx={0} cy={p.height * 0.2} rx={p.radius * 0.8} ry={p.height * 0.5} fill={item.colors.primary} />
            {/* Head */}
            <Circle cx={0} cy={-p.height * 0.3} r={p.radius * 0.6} fill={item.colors.primary} />
            {/* Ears */}
            <Circle cx={-p.radius * 0.45} cy={-p.height * 0.6} r={p.radius * 0.25} fill={item.colors.primary} />
            <Circle cx={p.radius * 0.45} cy={-p.height * 0.6} r={p.radius * 0.25} fill={item.colors.primary} />
            <Circle cx={-p.radius * 0.45} cy={-p.height * 0.6} r={p.radius * 0.15} fill={item.colors.secondary} />
            <Circle cx={p.radius * 0.45} cy={-p.height * 0.6} r={p.radius * 0.15} fill={item.colors.secondary} />
            {/* Snout */}
            <Ellipse cx={0} cy={-p.height * 0.15} rx={p.radius * 0.3} ry={p.height * 0.2} fill={item.colors.accent} />
            {/* Eyes */}
            <Circle cx={-12} cy={-p.height * 0.4} r={4} fill="#333" />
            <Circle cx={12} cy={-p.height * 0.4} r={4} fill="#333" />
            {/* Nose */}
            <Circle cx={0} cy={-p.height * 0.2} r={5} fill="#333" />
            {/* Arms */}
            <Ellipse cx={-p.radius * 0.7} cy={p.height * 0.1} rx={p.radius * 0.25} ry={p.height * 0.3} fill={item.colors.primary} />
            <Ellipse cx={p.radius * 0.7} cy={p.height * 0.1} rx={p.radius * 0.25} ry={p.height * 0.3} fill={item.colors.primary} />
          </>
        )}
        
        {item.id === 'phone' && (
          <>
            {/* Phone body */}
            <Rect x={-p.radius * 0.6} y={-p.height * 0.5} width={p.radius * 1.2} height={p.height} rx={6} fill={item.colors.primary} />
            {/* Screen */}
            <Rect x={-p.radius * 0.5} y={-p.height * 0.4} width={p.radius} height={p.height * 0.7} rx={3} fill="#1A1A1A" />
            {/* Crack lines */}
            <Line x1={-p.radius * 0.4} y1={-p.height * 0.3} x2={p.radius * 0.3} y2={p.height * 0.2} stroke="#666" strokeWidth={2} />
            <Line x1={p.radius * 0.2} y1={-p.height * 0.35} x2={-p.radius * 0.2} y2={p.height * 0.15} stroke="#666" strokeWidth={1.5} />
            <Line x1={-p.radius * 0.3} y1={0} x2={p.radius * 0.4} y2={p.height * 0.1} stroke="#666" strokeWidth={1} />
            {/* Home button */}
            <Circle cx={0} cy={p.height * 0.38} r={5} fill={item.colors.accent} />
            {/* Camera */}
            <Circle cx={0} cy={-p.height * 0.45} r={3} fill={item.colors.accent} />
          </>
        )}
      </G>
    );
  };

  // Render pan (handle on LEFT - correct side)
  const renderPan = () => {
    const tiltAngle = pan.tilt * 10;
    
    return (
      <G transform={`translate(${pan.x}, ${pan.y}) rotate(${tiltAngle})`}>
        {/* Shadow */}
        <Ellipse
          cx={0}
          cy={pan.height + 10}
          rx={pan.width / 2 + 10}
          ry={12}
          fill="rgba(0,0,0,0.25)"
        />
        {/* Handle - LEFT SIDE */}
        <Rect
          x={-pan.width / 2 - 58}
          y={-10}
          width={62}
          height={20}
          rx={10}
          fill="#5D4037"
        />
        <Rect
          x={-pan.width / 2 - 53}
          y={-6}
          width={55}
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
        {/* Inner surface */}
        <Ellipse
          cx={0}
          cy={3}
          rx={pan.width / 2 - 10}
          ry={pan.height - 6}
          fill="#2A2A2A"
        />
        {/* Highlight */}
        <Ellipse
          cx={15}
          cy={-8}
          rx={28}
          ry={9}
          fill="rgba(255,255,255,0.08)"
        />
        {/* Rim */}
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
    const dispenserX = GAME_WIDTH * 0.5;
    const dispenserY = 60;
    
    return (
      <G>
        {/* Machine body */}
        <Rect
          x={dispenserX - 55}
          y={dispenserY - 50}
          width={110}
          height={100}
          rx={14}
          fill="#E0E0E0"
          stroke="#BDBDBD"
          strokeWidth={3}
        />
        {/* Dispenser opening */}
        <Rect
          x={dispenserX - 28}
          y={dispenserY + 40}
          width={56}
          height={18}
          fill="#1A1A1A"
        />
        {/* Warning label */}
        <Rect
          x={dispenserX - 40}
          y={dispenserY - 35}
          width={80}
          height={25}
          rx={4}
          fill="#FFC107"
        />
        <Text
          x={dispenserX}
          y={dispenserY - 18}
          textAnchor="middle"
          fill="#333"
          fontSize={11}
          fontWeight="bold"
        >
          WASTE
        </Text>
        {/* Status indicator */}
        <Circle cx={dispenserX - 35} cy={dispenserY + 10} r={8} fill="#F44336" />
        <Circle cx={dispenserX + 35} cy={dispenserY + 10} r={8} fill="#4CAF50" />
      </G>
    );
  };

  // Render trash bin
  const renderTrashBin = () => {
    const bin = targetPosition;
    const binCenterX = bin.x + bin.width / 2;
    
    return (
      <G>
        {/* Shadow */}
        <Ellipse
          cx={binCenterX}
          cy={bin.y + bin.height + 5}
          rx={bin.width / 2 + 10}
          ry={15}
          fill="rgba(0,0,0,0.2)"
        />
        
        {/* Bin body */}
        <Path
          d={`M ${bin.x + 8} ${bin.openingY + 15}
              L ${bin.x} ${bin.y + bin.height}
              L ${bin.x + bin.width} ${bin.y + bin.height}
              L ${bin.x + bin.width - 8} ${bin.openingY + 15}
              Z`}
          fill="#455A64"
        />
        
        {/* Bin front face */}
        <Rect
          x={bin.x + 5}
          y={bin.openingY + 20}
          width={bin.width - 10}
          height={bin.height - 25}
          rx={5}
          fill="#546E7A"
        />
        
        {/* Recycle symbol area */}
        <Circle
          cx={binCenterX}
          cy={bin.openingY + bin.height / 2 + 10}
          r={25}
          fill="#37474F"
        />
        
        {/* Recycle arrows (simplified) */}
        <G transform={`translate(${binCenterX}, ${bin.openingY + bin.height / 2 + 10})`}>
          <Path
            d="M -12 -8 L 0 -18 L 12 -8 L 6 -8 L 0 0 L -6 -8 Z"
            fill="#4CAF50"
          />
          <Path
            d="M 15 5 L 10 18 L -5 12 L -2 8 L 8 5 L 5 12 Z"
            fill="#4CAF50"
            transform="rotate(120)"
          />
          <Path
            d="M 15 5 L 10 18 L -5 12 L -2 8 L 8 5 L 5 12 Z"
            fill="#4CAF50"
            transform="rotate(240)"
          />
        </G>
        
        {/* Bin rim / opening */}
        <Rect
          x={bin.x - 5}
          y={bin.openingY}
          width={bin.width + 10}
          height={18}
          rx={4}
          fill="#37474F"
        />
        
        {/* Opening hole (where patty goes in) */}
        <Rect
          x={bin.x + (bin.width - bin.openingWidth) / 2}
          y={bin.openingY + 3}
          width={bin.openingWidth}
          height={12}
          rx={3}
          fill="#1A1A1A"
        />
        
        {/* Rim highlights */}
        <Rect
          x={bin.x}
          y={bin.openingY + 2}
          width={8}
          height={14}
          rx={2}
          fill="#546E7A"
        />
        <Rect
          x={bin.x + bin.width - 8}
          y={bin.openingY + 2}
          width={8}
          height={14}
          rx={2}
          fill="#546E7A"
        />
      </G>
    );
  };

  // Render aim arrow
  const renderAimArrow = () => {
    const arrow = getAimArrow();
    if (!arrow) return null;
    
    const powerColor = arrow.power < 0.3 ? '#4CAF50' : arrow.power < 0.6 ? '#FFC107' : '#FF5722';
    
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
            opacity={Math.max(0.1, 1 - i * 0.025)}
          />
        ))}
        {/* Main arrow line */}
        <Line
          x1={arrow.startX}
          y1={arrow.startY}
          x2={arrow.endX}
          y2={arrow.endY}
          stroke={powerColor}
          strokeWidth={5}
          strokeLinecap="round"
        />
        {/* Arrow head */}
        <G transform={`translate(${arrow.endX}, ${arrow.endY}) rotate(${Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX) * 180 / Math.PI})`}>
          <Polygon
            points="0,0 -18,-10 -18,10"
            fill={powerColor}
          />
        </G>
        {/* Power indicator */}
        <Circle
          cx={arrow.startX}
          cy={arrow.startY - 35}
          r={18}
          fill="rgba(0,0,0,0.6)"
        />
        <Text
          x={arrow.startX}
          y={arrow.startY - 30}
          textAnchor="middle"
          fill="white"
          fontSize={13}
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
            <Text style={styles.sectionTitle}>Background</Text>
            
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
            
            <Text style={styles.subsectionTitle}>Brightness</Text>
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
          {renderDispenser()}
          {renderTrashBin()}
          {renderPan()}
          {renderPatty()}
          {renderAimArrow()}
        </Svg>
      </View>

      {/* UI Overlay */}
      <View style={styles.uiOverlay}>
        <View style={styles.levelContainer}>
          <Text style={styles.levelText}>Level {currentLevel + 1}</Text>
          <View style={styles.progressContainer}>
            <MaterialCommunityIcons name="delete" size={18} color="#4CAF50" />
            <Text style={styles.progressText}>{disposedCount}/{levelConfig.requiredPatties}</Text>
          </View>
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
      {gameState === 'waiting' && disposedCount === 0 && (
        <View style={styles.instructionsOverlay} pointerEvents="none">
          <MaterialCommunityIcons name="delete-empty" size={52} color="white" />
          <Text style={styles.instructionsText}>Dispose the Waste!</Text>
          <Text style={styles.instructionsSubtext}>Catch with pan, aim, and toss into bin</Text>
        </View>
      )}

      {/* Aiming hint */}
      {gameState === 'aiming' && (
        <View style={styles.aimHint} pointerEvents="none">
          <Text style={styles.aimHintText}>Drag to aim → Release to toss!</Text>
        </View>
      )}

      {/* Win overlay */}
      {gameState === 'win' && (
        <View style={styles.resultOverlay}>
          <MaterialCommunityIcons name="check-circle" size={80} color="#4CAF50" />
          <Text style={styles.winText}>Level Clear!</Text>
          <Text style={styles.resultSubtext}>{levelConfig.requiredPatties} patties disposed</Text>
        </View>
      )}
      
      {/* Fail overlay */}
      {gameState === 'fail' && (
        <View style={styles.resultOverlay}>
          <MaterialCommunityIcons name="emoticon-sad" size={70} color="#FF5722" />
          <Text style={styles.failText}>Missed!</Text>
          <Text style={styles.resultSubtext}>Restarting level...</Text>
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  levelText: {
    color: 'white',
    fontSize: 17,
    fontWeight: 'bold',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  progressText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 25,
    marginLeft: 'auto',
    marginRight: 10,
  },
  settingsButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 25,
  },
  instructionsOverlay: {
    position: 'absolute',
    top: '28%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionsText: {
    color: 'white',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 14,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  instructionsSubtext: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
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
    fontSize: 17,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  winText: {
    color: '#4CAF50',
    fontSize: 42,
    fontWeight: 'bold',
    marginTop: 15,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  failText: {
    color: '#FF5722',
    fontSize: 42,
    fontWeight: 'bold',
    marginTop: 15,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  resultSubtext: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
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
