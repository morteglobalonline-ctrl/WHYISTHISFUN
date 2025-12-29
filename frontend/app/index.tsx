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
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect, G, Ellipse, Line } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

// Physics constants
const GRAVITY = 0.6;
const FRICTION = 0.99;
const BOUNCE = 0.6;
const PAN_BOUNCE = 0.7;
const PATTY_RADIUS = 35;
const WIN_STABILITY_TIME = 1000; // 1 second
const SPAWN_DELAY = 1200; // ms before next patty spawns

// Built-in background options
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
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  brownLevel: number;
}

interface Pan {
  x: number;
  y: number;
  width: number;
  height: number;
  tilt: number; // -1 to 1 for tilt angle
  vx: number;
}

interface Target {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Hazard {
  type: 'grill' | 'knife';
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
  hazards: Hazard[];
  panStartX: number;
}

const TOTAL_LEVELS = 5;

export default function BurgerFlipGame() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const GAME_WIDTH = windowWidth;
  const GAME_HEIGHT = windowHeight;

  const [currentLevel, setCurrentLevel] = useState(0);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'win' | 'fail'>('waiting');
  const [patty, setPatty] = useState<Patty | null>(null);
  const [pan, setPan] = useState<Pan>({
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT * 0.65,
    width: 120,
    height: 25,
    tilt: 0,
    vx: 0,
  });
  
  // Background settings
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState('#8B5A2B');
  const [backgroundMode, setBackgroundMode] = useState<'fill' | 'fit'>('fill');
  const [backgroundBrightness, setBackgroundBrightness] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  
  // Refs for physics
  const gameLoopRef = useRef<number | null>(null);
  const pattyRef = useRef<Patty | null>(null);
  const panRef = useRef<Pan>(pan);
  const winTimerRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastTouchXRef = useRef(0);
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate level based on current dimensions
  const getLevelConfig = useCallback((levelIndex: number): Level => {
    const configs: Level[] = [
      {
        id: 1,
        dispenserX: GAME_WIDTH * 0.5,
        dispenserY: 60,
        target: { x: GAME_WIDTH * 0.7, y: GAME_HEIGHT - 140, width: 100, height: 45 },
        hazards: [],
        panStartX: GAME_WIDTH * 0.3,
      },
      {
        id: 2,
        dispenserX: GAME_WIDTH * 0.3,
        dispenserY: 60,
        target: { x: GAME_WIDTH * 0.75, y: GAME_HEIGHT - 140, width: 100, height: 45 },
        hazards: [],
        panStartX: GAME_WIDTH * 0.4,
      },
      {
        id: 3,
        dispenserX: GAME_WIDTH * 0.5,
        dispenserY: 60,
        target: { x: GAME_WIDTH * 0.8 - 50, y: GAME_HEIGHT - 140, width: 100, height: 45 },
        hazards: [
          { type: 'grill', x: GAME_WIDTH * 0.5, y: GAME_HEIGHT * 0.85, width: 100, height: 20 },
        ],
        panStartX: GAME_WIDTH * 0.25,
      },
      {
        id: 4,
        dispenserX: GAME_WIDTH * 0.7,
        dispenserY: 60,
        target: { x: GAME_WIDTH * 0.2, y: GAME_HEIGHT - 140, width: 100, height: 45 },
        hazards: [
          { type: 'grill', x: GAME_WIDTH * 0.5, y: GAME_HEIGHT * 0.8, width: 80, height: 20 },
        ],
        panStartX: GAME_WIDTH * 0.6,
      },
      {
        id: 5,
        dispenserX: GAME_WIDTH * 0.4,
        dispenserY: 60,
        target: { x: GAME_WIDTH * 0.85 - 50, y: GAME_HEIGHT - 140, width: 100, height: 45 },
        hazards: [
          { type: 'grill', x: GAME_WIDTH * 0.3, y: GAME_HEIGHT * 0.75, width: 70, height: 18 },
          { type: 'grill', x: GAME_WIDTH * 0.65, y: GAME_HEIGHT * 0.85, width: 70, height: 18 },
        ],
        panStartX: GAME_WIDTH * 0.35,
      },
    ];
    return configs[levelIndex] || configs[0];
  }, [GAME_WIDTH, GAME_HEIGHT]);

  const level = getLevelConfig(currentLevel);

  // Initialize pan position for current level
  useEffect(() => {
    const newPan = {
      x: level.panStartX,
      y: GAME_HEIGHT * 0.65,
      width: 120,
      height: 25,
      tilt: 0,
      vx: 0,
    };
    setPan(newPan);
    panRef.current = newPan;
  }, [currentLevel, level.panStartX, GAME_HEIGHT]);

  // Spawn patty from dispenser
  const spawnPatty = useCallback(() => {
    const newPatty: Patty = {
      x: level.dispenserX,
      y: level.dispenserY + 50,
      vx: (Math.random() - 0.5) * 2,
      vy: 2,
      radius: PATTY_RADIUS,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      brownLevel: 0,
    };
    pattyRef.current = newPatty;
    setPatty(newPatty);
    setGameState('playing');
    winTimerRef.current = null;
  }, [level.dispenserX, level.dispenserY]);

  // Start game / spawn first patty
  const startGame = useCallback(() => {
    if (gameState === 'waiting') {
      spawnPatty();
    }
  }, [gameState, spawnPatty]);

  // Auto-start after delay
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

  // Check collision between patty and pan
  const checkPanCollision = useCallback((p: Patty, panState: Pan): { collides: boolean; normal: Point; overlap: number } => {
    // Pan top surface (with tilt)
    const panLeft = panState.x - panState.width / 2;
    const panRight = panState.x + panState.width / 2;
    const panTop = panState.y - panState.height / 2;
    const tiltOffset = panState.tilt * 15; // Max tilt offset
    
    // Check if patty is above pan area horizontally
    if (p.x + p.radius < panLeft || p.x - p.radius > panRight) {
      return { collides: false, normal: { x: 0, y: 0 }, overlap: 0 };
    }
    
    // Calculate pan surface Y at patty X position
    const relativeX = (p.x - panState.x) / (panState.width / 2);
    const panSurfaceY = panTop - tiltOffset * relativeX;
    
    // Check vertical collision
    const distToSurface = p.y + p.radius - panSurfaceY;
    
    if (distToSurface > 0 && distToSurface < p.radius * 2 && p.vy > 0) {
      // Calculate normal based on tilt
      const normalAngle = Math.atan2(-tiltOffset, panState.width / 2);
      return {
        collides: true,
        normal: { x: Math.sin(normalAngle), y: -Math.cos(normalAngle) },
        overlap: distToSurface,
      };
    }
    
    return { collides: false, normal: { x: 0, y: 0 }, overlap: 0 };
  }, []);

  // Check collision with rectangle (for target and hazards)
  const rectCircleCollision = useCallback((
    cx: number,
    cy: number,
    radius: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ): boolean => {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const distX = cx - closestX;
    const distY = cy - closestY;
    return (distX * distX + distY * distY) < (radius * radius);
  }, []);

  // Physics update
  const updatePhysics = useCallback(() => {
    if (!pattyRef.current || gameState !== 'playing') return;

    const p = { ...pattyRef.current };
    const panState = panRef.current;
    
    // Apply gravity
    p.vy += GRAVITY;
    
    // Apply velocity
    p.x += p.vx;
    p.y += p.vy;
    
    // Apply friction
    p.vx *= FRICTION;
    
    // Update rotation
    p.rotation += p.rotationSpeed;
    p.rotationSpeed *= 0.995;

    // Check pan collision
    const panCollision = checkPanCollision(p, panState);
    if (panCollision.collides) {
      // Push patty out
      p.y -= panCollision.overlap;
      
      // Apply pan velocity to patty (flip effect)
      const flipForce = panState.vx * 0.5;
      p.vx += flipForce;
      
      // Reflect velocity with tilt influence
      const tiltBoost = panState.tilt * 8;
      p.vy = -Math.abs(p.vy) * PAN_BOUNCE - 5 - Math.abs(panState.vx) * 0.3;
      p.vx += tiltBoost;
      
      // Add rotation based on pan movement
      p.rotationSpeed += panState.vx * 0.02;
    }

    // Check screen bounds (sides)
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

    // Check hazard collisions
    for (const hazard of level.hazards) {
      if (rectCircleCollision(p.x, p.y, p.radius, hazard.x - hazard.width/2, hazard.y - hazard.height/2, hazard.width, hazard.height)) {
        p.brownLevel = 1; // Instant burn
        handleFail();
        return;
      }
    }

    // Check win condition - patty on target
    const target = level.target;
    const isOnTarget = rectCircleCollision(
      p.x, p.y, p.radius,
      target.x, target.y, target.width, target.height
    );
    
    const isStable = Math.abs(p.vx) < 1 && Math.abs(p.vy) < 1 && p.y > target.y - p.radius;

    if (isOnTarget && isStable) {
      // Keep patty on target
      if (p.y < target.y) {
        p.y = target.y + p.radius / 2;
        p.vy = 0;
      }
      
      if (!winTimerRef.current) {
        winTimerRef.current = Date.now();
      } else if (Date.now() - winTimerRef.current >= WIN_STABILITY_TIME) {
        handleWin();
        return;
      }
    } else {
      winTimerRef.current = null;
    }

    pattyRef.current = p;
    setPatty(p);
  }, [gameState, GAME_WIDTH, GAME_HEIGHT, level, checkPanCollision, rectCircleCollision]);

  // Game loop
  useEffect(() => {
    if (gameState === 'playing') {
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
    }, 1500);
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
    setPatty(null);
    pattyRef.current = null;
    const newPan = {
      x: level.panStartX,
      y: GAME_HEIGHT * 0.65,
      width: 120,
      height: 25,
      tilt: 0,
      vx: 0,
    };
    setPan(newPan);
    panRef.current = newPan;
    setGameState('waiting');
    winTimerRef.current = null;
  }, [level.panStartX, GAME_HEIGHT]);

  const nextLevel = useCallback(() => {
    if (currentLevel < TOTAL_LEVELS - 1) {
      setCurrentLevel(currentLevel + 1);
    } else {
      setCurrentLevel(0);
    }
    setPatty(null);
    pattyRef.current = null;
    setGameState('waiting');
    winTimerRef.current = null;
  }, [currentLevel]);

  // Pan control handlers
  const handlePanStart = useCallback((x: number) => {
    isDraggingRef.current = true;
    lastTouchXRef.current = x;
  }, []);

  const handlePanMove = useCallback((x: number) => {
    if (!isDraggingRef.current) return;
    
    const deltaX = x - lastTouchXRef.current;
    lastTouchXRef.current = x;
    
    const newPan = { ...panRef.current };
    newPan.vx = deltaX * 0.8;
    newPan.x = Math.max(newPan.width / 2, Math.min(GAME_WIDTH - newPan.width / 2, newPan.x + deltaX));
    newPan.tilt = Math.max(-1, Math.min(1, deltaX / 20));
    
    panRef.current = newPan;
    setPan(newPan);
  }, [GAME_WIDTH]);

  const handlePanEnd = useCallback(() => {
    isDraggingRef.current = false;
    const newPan = { ...panRef.current, tilt: 0, vx: 0 };
    panRef.current = newPan;
    setPan(newPan);
  }, []);

  // Touch event handlers
  const onTouchStart = useCallback((e: any) => {
    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX;
    handlePanStart(x);
    
    // Start game on first touch if waiting
    if (gameState === 'waiting') {
      startGame();
    }
  }, [handlePanStart, gameState, startGame]);

  const onTouchMove = useCallback((e: any) => {
    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX;
    handlePanMove(x);
  }, [handlePanMove]);

  const onTouchEnd = useCallback(() => {
    handlePanEnd();
  }, [handlePanEnd]);

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

  // Render patty
  const renderPatty = () => {
    if (!patty) return null;
    
    const baseColor = `rgb(${139 + patty.brownLevel * 60}, ${90 - patty.brownLevel * 50}, ${43 - patty.brownLevel * 30})`;
    
    return (
      <G transform={`translate(${patty.x}, ${patty.y}) rotate(${patty.rotation * 180 / Math.PI})`}>
        {/* Shadow */}
        <Ellipse
          cx={0}
          cy={patty.radius + 8}
          rx={patty.radius * 0.9}
          ry={patty.radius * 0.3}
          fill="rgba(0,0,0,0.25)"
        />
        {/* Patty body */}
        <Circle
          cx={0}
          cy={0}
          r={patty.radius}
          fill={baseColor}
        />
        {/* Patty texture/highlights */}
        <Circle cx={-12} cy={-8} r={6} fill={`rgba(80, 50, 25, ${0.4 + patty.brownLevel * 0.2})`} />
        <Circle cx={10} cy={-5} r={5} fill={`rgba(80, 50, 25, ${0.4 + patty.brownLevel * 0.2})`} />
        <Circle cx={0} cy={10} r={7} fill={`rgba(80, 50, 25, ${0.4 + patty.brownLevel * 0.2})`} />
        <Circle cx={15} cy={8} r={4} fill={`rgba(80, 50, 25, ${0.3 + patty.brownLevel * 0.2})`} />
        <Circle cx={-8} cy={12} r={5} fill={`rgba(80, 50, 25, ${0.3 + patty.brownLevel * 0.2})`} />
        {/* Shine highlight */}
        <Ellipse cx={-8} cy={-12} rx={8} ry={5} fill="rgba(255,255,255,0.15)" />
      </G>
    );
  };

  // Render pan
  const renderPan = () => {
    const tiltAngle = pan.tilt * 15;
    
    return (
      <G transform={`translate(${pan.x}, ${pan.y}) rotate(${tiltAngle})`}>
        {/* Pan shadow */}
        <Ellipse
          cx={0}
          cy={pan.height + 5}
          rx={pan.width / 2 + 5}
          ry={8}
          fill="rgba(0,0,0,0.3)"
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
          cy={2}
          rx={pan.width / 2 - 8}
          ry={pan.height - 5}
          fill="#2A2A2A"
        />
        {/* Pan highlight */}
        <Ellipse
          cx={-15}
          cy={-5}
          rx={25}
          ry={8}
          fill="rgba(255,255,255,0.1)"
        />
        {/* Handle */}
        <Rect
          x={pan.width / 2 - 5}
          y={-8}
          width={50}
          height={16}
          rx={8}
          fill="#5D4037"
        />
        <Rect
          x={pan.width / 2}
          y={-5}
          width={45}
          height={10}
          rx={5}
          fill="#6D4C41"
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
          x={level.dispenserX - 50}
          y={level.dispenserY - 45}
          width={100}
          height={90}
          rx={12}
          fill="#E0E0E0"
          stroke="#BDBDBD"
          strokeWidth={3}
        />
        {/* Dispenser opening */}
        <Rect
          x={level.dispenserX - 25}
          y={level.dispenserY + 35}
          width={50}
          height={18}
          fill="#1A1A1A"
        />
        {/* Machine face details */}
        <Rect
          x={level.dispenserX - 35}
          y={level.dispenserY - 30}
          width={20}
          height={20}
          rx={4}
          fill="#FF5252"
        />
        <Rect
          x={level.dispenserX - 10}
          y={level.dispenserY - 30}
          width={20}
          height={20}
          rx={4}
          fill="#4CAF50"
        />
        <Rect
          x={level.dispenserX + 15}
          y={level.dispenserY - 30}
          width={20}
          height={20}
          rx={4}
          fill="#FFC107"
        />
        {/* Display */}
        <Rect
          x={level.dispenserX - 35}
          y={level.dispenserY + 5}
          width={70}
          height={25}
          rx={3}
          fill="#1A237E"
        />
      </G>
    );
  };

  // Render target (bun/plate)
  const renderTarget = () => {
    const target = level.target;
    return (
      <G>
        {/* Plate */}
        <Ellipse
          cx={target.x + target.width / 2}
          cy={target.y + target.height - 5}
          rx={target.width / 2 + 10}
          ry={15}
          fill="#ECEFF1"
          stroke="#B0BEC5"
          strokeWidth={2}
        />
        {/* Bun bottom */}
        <Rect
          x={target.x}
          y={target.y}
          width={target.width}
          height={target.height}
          rx={10}
          fill="#D4A574"
        />
        {/* Bun details */}
        <Ellipse cx={target.x + 25} cy={target.y + 12} rx={5} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 55} cy={target.y + 18} rx={5} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 78} cy={target.y + 10} rx={5} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 40} cy={target.y + 30} rx={5} ry={3} fill="#F5F5DC" />
        <Ellipse cx={target.x + 70} cy={target.y + 35} rx={5} ry={3} fill="#F5F5DC" />
        {/* Lettuce hint */}
        <Path
          d={`M ${target.x + 5} ${target.y + 5} Q ${target.x + 25} ${target.y - 5} ${target.x + 50} ${target.y + 5} Q ${target.x + 75} ${target.y - 5} ${target.x + 95} ${target.y + 5}`}
          fill="none"
          stroke="#66BB6A"
          strokeWidth={4}
        />
      </G>
    );
  };

  // Render hazards
  const renderHazards = () => {
    return level.hazards.map((hazard, index) => {
      if (hazard.type === 'grill') {
        return (
          <G key={`hazard-${index}`}>
            {/* Grill base */}
            <Rect
              x={hazard.x - hazard.width / 2}
              y={hazard.y - hazard.height / 2}
              width={hazard.width}
              height={hazard.height}
              rx={3}
              fill="#424242"
            />
            {/* Grill lines */}
            {[...Array(5)].map((_, i) => (
              <Line
                key={`grill-line-${i}`}
                x1={hazard.x - hazard.width / 2 + 10 + i * ((hazard.width - 20) / 4)}
                y1={hazard.y - hazard.height / 2 + 3}
                x2={hazard.x - hazard.width / 2 + 10 + i * ((hazard.width - 20) / 4)}
                y2={hazard.y + hazard.height / 2 - 3}
                stroke="#FF5722"
                strokeWidth={3}
              />
            ))}
            {/* Heat glow */}
            <Rect
              x={hazard.x - hazard.width / 2}
              y={hazard.y - hazard.height / 2 - 5}
              width={hazard.width}
              height={5}
              fill="rgba(255, 87, 34, 0.4)"
            />
          </G>
        );
      }
      return null;
    });
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
            
            {/* Upload custom background */}
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
            
            {/* Background mode */}
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
            
            {/* Brightness slider */}
            <Text style={styles.subsectionTitle}>Background Brightness</Text>
            <View style={styles.sliderRow}>
              <Ionicons name="sunny-outline" size={20} color="#666" />
              <View style={styles.sliderContainer}>
                {Platform.OS === 'web' ? (
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.1"
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
          {renderHazards()}
          {renderPan()}
          {renderPatty()}
        </Svg>
      </View>

      {/* UI Overlay */}
      <View style={styles.uiOverlay}>
        <View style={styles.levelContainer}>
          <Text style={styles.levelText}>Level {currentLevel + 1}</Text>
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

      {/* Instructions overlay */}
      {gameState === 'waiting' && (
        <View style={styles.instructionsOverlay} pointerEvents="none">
          <MaterialCommunityIcons name="pan" size={48} color="white" />
          <Text style={styles.instructionsText}>Drag to move the pan!</Text>
          <Text style={styles.instructionsSubtext}>Catch & flip the patty onto the bun</Text>
        </View>
      )}

      {/* Win overlay */}
      {gameState === 'win' && (
        <View style={styles.resultOverlay}>
          <Text style={styles.winText}>Perfect!</Text>
          <Text style={styles.resultSubtext}>Next level...</Text>
        </View>
      )}
      
      {/* Fail overlay */}
      {gameState === 'fail' && (
        <View style={styles.resultOverlay}>
          <Text style={styles.failText}>Oops!</Text>
          <Text style={styles.resultSubtext}>Try again...</Text>
        </View>
      )}

      {/* Settings Modal */}
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
  },
  levelText: {
    color: 'white',
    fontSize: 18,
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
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionsText: {
    color: 'white',
    fontSize: 26,
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
    fontSize: 56,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
  failText: {
    color: '#FF5252',
    fontSize: 56,
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
