import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  useWindowDimensions,
  PanResponder,
  GestureResponderEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect, G, Polygon, Ellipse } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

// Physics constants
const GRAVITY = 0.5;
const FRICTION = 0.98;
const BOUNCE = 0.3;
const PATTY_RADIUS = 25;
const MAX_DRAW_LENGTH = 500;
const WIN_STABILITY_TIME = 1000; // 1 second
const FAIL_REST_TIME = 3000; // 3 seconds

interface Point {
  x: number;
  y: number;
}

interface DrawnShape {
  id: string;
  points: Point[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

interface Patty {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isActive: boolean;
  brownLevel: number; // 0-1 for browning effect
}

interface Hazard {
  type: 'knife' | 'fire' | 'grill';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
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
  hazards: Hazard[];
  obstacles: { x: number; y: number; width: number; height: number }[];
}

const TOTAL_LEVELS = 5;

export default function BurgerDropGame() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const GAME_WIDTH = windowWidth;
  const GAME_HEIGHT = windowHeight;
  
  const [currentLevel, setCurrentLevel] = useState(0);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'win' | 'fail'>('ready');
  const [patty, setPatty] = useState<Patty | null>(null);
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [currentDrawLength, setCurrentDrawLength] = useState(0);
  
  const gameLoopRef = useRef<number | null>(null);
  const pattyRef = useRef<Patty | null>(null);
  const winTimerRef = useRef<number | null>(null);
  const failTimerRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Generate level based on current dimensions
  const getLevelConfig = useCallback((levelIndex: number): Level => {
    const configs: Level[] = [
      {
        id: 1,
        dispenserX: GAME_WIDTH * 0.3,
        dispenserY: 80,
        target: { x: GAME_WIDTH * 0.6, y: GAME_HEIGHT - 180, width: 100, height: 40 },
        hazards: [],
        obstacles: [],
      },
      {
        id: 2,
        dispenserX: GAME_WIDTH * 0.2,
        dispenserY: 80,
        target: { x: GAME_WIDTH * 0.7, y: GAME_HEIGHT - 180, width: 100, height: 40 },
        hazards: [
          { type: 'knife', x: GAME_WIDTH * 0.5, y: GAME_HEIGHT * 0.5, width: 120, height: 30, rotation: -30 },
        ],
        obstacles: [],
      },
      {
        id: 3,
        dispenserX: GAME_WIDTH * 0.5,
        dispenserY: 80,
        target: { x: GAME_WIDTH * 0.5, y: GAME_HEIGHT - 180, width: 100, height: 40 },
        hazards: [
          { type: 'knife', x: GAME_WIDTH * 0.25, y: GAME_HEIGHT * 0.4, width: 100, height: 25, rotation: 45 },
          { type: 'knife', x: GAME_WIDTH * 0.75, y: GAME_HEIGHT * 0.4, width: 100, height: 25, rotation: -45 },
        ],
        obstacles: [
          { x: GAME_WIDTH * 0.4, y: GAME_HEIGHT * 0.6, width: 80, height: 15 },
        ],
      },
      {
        id: 4,
        dispenserX: GAME_WIDTH * 0.8,
        dispenserY: 80,
        target: { x: GAME_WIDTH * 0.2, y: GAME_HEIGHT - 180, width: 100, height: 40 },
        hazards: [
          { type: 'fire', x: GAME_WIDTH * 0.5, y: GAME_HEIGHT * 0.7, width: 80, height: 60 },
          { type: 'knife', x: GAME_WIDTH * 0.3, y: GAME_HEIGHT * 0.35, width: 100, height: 25, rotation: 20 },
        ],
        obstacles: [],
      },
      {
        id: 5,
        dispenserX: GAME_WIDTH * 0.15,
        dispenserY: 80,
        target: { x: GAME_WIDTH * 0.85 - 50, y: GAME_HEIGHT - 180, width: 100, height: 40 },
        hazards: [
          { type: 'knife', x: GAME_WIDTH * 0.4, y: GAME_HEIGHT * 0.3, width: 110, height: 28, rotation: -15 },
          { type: 'fire', x: GAME_WIDTH * 0.6, y: GAME_HEIGHT * 0.55, width: 70, height: 55 },
          { type: 'knife', x: GAME_WIDTH * 0.3, y: GAME_HEIGHT * 0.65, width: 90, height: 22, rotation: 40 },
        ],
        obstacles: [
          { x: GAME_WIDTH * 0.6, y: GAME_HEIGHT * 0.4, width: 70, height: 12 },
        ],
      },
    ];
    return configs[levelIndex] || configs[0];
  }, [GAME_WIDTH, GAME_HEIGHT]);

  const level = getLevelConfig(currentLevel);

  // Calculate path length
  const calculatePathLength = (points: Point[]): number => {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  };

  // Check collision between patty and line segment
  const lineCircleCollision = (
    cx: number,
    cy: number,
    radius: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): { collides: boolean; normal: Point; penetration: number } => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    
    let t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lengthSq));
    
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    const distX = cx - closestX;
    const distY = cy - closestY;
    const dist = Math.sqrt(distX * distX + distY * distY);
    
    if (dist < radius) {
      const normalLength = dist || 1;
      return {
        collides: true,
        normal: { x: distX / normalLength, y: distY / normalLength },
        penetration: radius - dist,
      };
    }
    
    return { collides: false, normal: { x: 0, y: 0 }, penetration: 0 };
  };

  // Check collision with rectangle
  const rectCircleCollision = (
    cx: number,
    cy: number,
    radius: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ): { collides: boolean; normal: Point; penetration: number } => {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    
    const distX = cx - closestX;
    const distY = cy - closestY;
    const dist = Math.sqrt(distX * distX + distY * distY);
    
    if (dist < radius) {
      const normalLength = dist || 1;
      return {
        collides: true,
        normal: { x: distX / normalLength, y: distY / normalLength },
        penetration: radius - dist,
      };
    }
    
    return { collides: false, normal: { x: 0, y: 0 }, penetration: 0 };
  };

  // Physics update
  const updatePhysics = useCallback(() => {
    if (!pattyRef.current || gameState !== 'playing') return;

    const p = { ...pattyRef.current };
    
    // Apply gravity
    p.vy += GRAVITY;
    
    // Apply velocity
    p.x += p.vx;
    p.y += p.vy;
    
    // Apply friction
    p.vx *= FRICTION;
    
    // Check collisions with drawn shapes
    drawnShapes.forEach((shape) => {
      for (let i = 1; i < shape.points.length; i++) {
        const collision = lineCircleCollision(
          p.x,
          p.y,
          p.radius,
          shape.points[i - 1].x,
          shape.points[i - 1].y,
          shape.points[i].x,
          shape.points[i].y
        );
        
        if (collision.collides) {
          // Push patty out of collision
          p.x += collision.normal.x * collision.penetration;
          p.y += collision.normal.y * collision.penetration;
          
          // Reflect velocity
          const dot = p.vx * collision.normal.x + p.vy * collision.normal.y;
          p.vx = (p.vx - 2 * dot * collision.normal.x) * BOUNCE;
          p.vy = (p.vy - 2 * dot * collision.normal.y) * BOUNCE;
        }
      }
    });

    // Check collisions with obstacles
    level.obstacles.forEach((obs) => {
      const collision = rectCircleCollision(
        p.x,
        p.y,
        p.radius,
        obs.x,
        obs.y,
        obs.width,
        obs.height
      );
      
      if (collision.collides) {
        p.x += collision.normal.x * collision.penetration;
        p.y += collision.normal.y * collision.penetration;
        
        const dot = p.vx * collision.normal.x + p.vy * collision.normal.y;
        p.vx = (p.vx - 2 * dot * collision.normal.x) * BOUNCE;
        p.vy = (p.vy - 2 * dot * collision.normal.y) * BOUNCE;
      }
    });

    // Check hazard collisions
    for (const hazard of level.hazards) {
      const collision = rectCircleCollision(
        p.x,
        p.y,
        p.radius,
        hazard.x - hazard.width / 2,
        hazard.y - hazard.height / 2,
        hazard.width,
        hazard.height
      );
      
      if (collision.collides) {
        if (hazard.type === 'fire') {
          p.brownLevel = Math.min(1, p.brownLevel + 0.05);
          if (p.brownLevel >= 1) {
            handleFail();
            return;
          }
        } else if (hazard.type === 'knife') {
          handleFail();
          return;
        }
      }
    }

    // Check screen bounds
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

    // Check win condition
    const target = level.target;
    const isOnTarget =
      p.x > target.x &&
      p.x < target.x + target.width &&
      p.y + p.radius > target.y &&
      p.y + p.radius < target.y + target.height + 20;

    const isStable = Math.abs(p.vx) < 0.5 && Math.abs(p.vy) < 0.5;

    if (isOnTarget && isStable) {
      if (!winTimerRef.current) {
        winTimerRef.current = Date.now();
      } else if (Date.now() - winTimerRef.current >= WIN_STABILITY_TIME) {
        handleWin();
        return;
      }
    } else {
      winTimerRef.current = null;
    }

    // Check fail condition (resting in invalid position)
    if (isStable && !isOnTarget && p.y > 100) {
      if (!failTimerRef.current) {
        failTimerRef.current = Date.now();
      } else if (Date.now() - failTimerRef.current >= FAIL_REST_TIME) {
        handleFail();
        return;
      }
    } else if (!isStable) {
      failTimerRef.current = null;
    }

    pattyRef.current = p;
    setPatty(p);
  }, [gameState, drawnShapes, level]);

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

  const handleWin = () => {
    setGameState('win');
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    setTimeout(() => {
      nextLevel();
    }, 1000);
  };

  const handleFail = () => {
    setGameState('fail');
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    setTimeout(() => {
      restartLevel();
    }, 1000);
  };

  const startGame = () => {
    const newPatty: Patty = {
      x: level.dispenserX,
      y: level.dispenserY + 60,
      vx: 0,
      vy: 0,
      radius: PATTY_RADIUS,
      isActive: true,
      brownLevel: 0,
    };
    pattyRef.current = newPatty;
    setPatty(newPatty);
    setGameState('playing');
    winTimerRef.current = null;
    failTimerRef.current = null;
  };

  const restartLevel = () => {
    setDrawnShapes([]);
    setCurrentPath([]);
    setCurrentDrawLength(0);
    setPatty(null);
    pattyRef.current = null;
    setGameState('ready');
    winTimerRef.current = null;
    failTimerRef.current = null;
  };

  const nextLevel = () => {
    if (currentLevel < TOTAL_LEVELS - 1) {
      setCurrentLevel(currentLevel + 1);
    } else {
      setCurrentLevel(0); // Loop back to first level
    }
    restartLevel();
  };

  // Track current path in a ref for immediate access in PanResponder
  const currentPathRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);

  // Drawing with PanResponder for better web compatibility
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event: GestureResponderEvent) => {
      if (gameState === 'win' || gameState === 'fail') return;
      const { locationX, locationY } = event.nativeEvent;
      console.log('Touch started:', locationX, locationY);
      isDrawingRef.current = true;
      setIsDrawing(true);
      currentPathRef.current = [{ x: locationX, y: locationY }];
      setCurrentPath([{ x: locationX, y: locationY }]);
    },
    onPanResponderMove: (event: GestureResponderEvent) => {
      if (!isDrawingRef.current || gameState === 'win' || gameState === 'fail') return;
      
      const { locationX, locationY } = event.nativeEvent;
      const newPoint = { x: locationX, y: locationY };
      const newPath = [...currentPathRef.current, newPoint];
      const totalLength = calculatePathLength(newPath);
      
      // Calculate total drawn length including previous shapes
      const previousLength = drawnShapes.reduce(
        (sum, shape) => sum + calculatePathLength(shape.points),
        0
      );
      
      if (previousLength + totalLength <= MAX_DRAW_LENGTH) {
        currentPathRef.current = newPath;
        setCurrentPath(newPath);
        setCurrentDrawLength(previousLength + totalLength);
      }
    },
    onPanResponderRelease: () => {
      console.log('Touch released, path length:', currentPathRef.current.length);
      if (!isDrawingRef.current || currentPathRef.current.length < 2) {
        isDrawingRef.current = false;
        setIsDrawing(false);
        currentPathRef.current = [];
        setCurrentPath([]);
        return;
      }

      // Calculate bounds
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      currentPathRef.current.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });

      const newShape: DrawnShape = {
        id: Date.now().toString(),
        points: [...currentPathRef.current],
        bounds: { minX, maxX, minY, maxY },
      };

      setDrawnShapes((prev) => [...prev, newShape]);
      isDrawingRef.current = false;
      setIsDrawing(false);
      currentPathRef.current = [];
      setCurrentPath([]);

      // Auto-start game after first draw if ready
      if (gameState === 'ready') {
        startGame();
      }
    },
    onPanResponderTerminate: () => {
      isDrawingRef.current = false;
      setIsDrawing(false);
      currentPathRef.current = [];
      setCurrentPath([]);
    },
  }), [gameState, drawnShapes, startGame]);

  // Pick background image
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
    setShowMenu(false);
  };

  // Render patty
  const renderPatty = () => {
    if (!patty) return null;
    
    const baseColor = `rgb(${139 + patty.brownLevel * 50}, ${90 - patty.brownLevel * 40}, ${43 - patty.brownLevel * 20})`;
    
    return (
      <G>
        {/* Shadow */}
        <Ellipse
          cx={patty.x}
          cy={patty.y + patty.radius + 5}
          rx={patty.radius * 0.8}
          ry={patty.radius * 0.3}
          fill="rgba(0,0,0,0.2)"
        />
        {/* Patty body */}
        <Circle
          cx={patty.x}
          cy={patty.y}
          r={patty.radius}
          fill={baseColor}
        />
        {/* Patty texture */}
        <Circle
          cx={patty.x - 8}
          cy={patty.y - 5}
          r={4}
          fill={`rgba(100, 60, 30, ${0.3 + patty.brownLevel * 0.2})`}
        />
        <Circle
          cx={patty.x + 6}
          cy={patty.y + 3}
          r={3}
          fill={`rgba(100, 60, 30, ${0.3 + patty.brownLevel * 0.2})`}
        />
        <Circle
          cx={patty.x - 3}
          cy={patty.y + 8}
          r={3.5}
          fill={`rgba(100, 60, 30, ${0.3 + patty.brownLevel * 0.2})`}
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
          x={level.dispenserX - 45}
          y={level.dispenserY - 40}
          width={90}
          height={80}
          rx={10}
          fill="#E8E8E8"
          stroke="#CCCCCC"
          strokeWidth={2}
        />
        {/* Dispenser opening */}
        <Rect
          x={level.dispenserX - 20}
          y={level.dispenserY + 30}
          width={40}
          height={15}
          fill="#333333"
        />
        {/* Machine details */}
        <Rect
          x={level.dispenserX - 30}
          y={level.dispenserY - 25}
          width={15}
          height={15}
          rx={3}
          fill="#FF6B6B"
        />
        <Rect
          x={level.dispenserX - 10}
          y={level.dispenserY - 25}
          width={15}
          height={15}
          rx={3}
          fill="#4ECDC4"
        />
        <Rect
          x={level.dispenserX + 10}
          y={level.dispenserY - 25}
          width={15}
          height={15}
          rx={3}
          fill="#FFE66D"
        />
        {/* Chicken head decoration */}
        <G transform={`translate(${level.dispenserX + 35}, ${level.dispenserY - 20})`}>
          <Ellipse cx={0} cy={0} rx={20} ry={18} fill="white" />
          {/* Comb */}
          <Path
            d="M -5 -18 L -3 -25 L 0 -18 L 3 -28 L 6 -18"
            fill="#FF4444"
          />
          {/* Beak */}
          <Polygon points="15,0 25,-3 25,5" fill="#FFB347" />
          {/* Eye */}
          <Circle cx={5} cy={-3} r={4} fill="#333" />
          <Circle cx={6} cy={-4} r={1.5} fill="white" />
          {/* Wattle */}
          <Ellipse cx={10} cy={8} rx={5} ry={8} fill="#FF4444" />
        </G>
      </G>
    );
  };

  // Render target
  const renderTarget = () => {
    const target = level.target;
    return (
      <G>
        {/* Hand */}
        <G transform={`translate(${target.x + target.width + 10}, ${target.y + 20})`}>
          <Rect x={0} y={0} width={25} height={50} rx={5} fill="#F4C2A1" />
          <Rect x={-8} y={10} width={12} height={30} rx={4} fill="#F4C2A1" />
        </G>
        {/* Plate/Bun bottom */}
        <Rect
          x={target.x}
          y={target.y}
          width={target.width}
          height={target.height}
          rx={8}
          fill="#D4A574"
        />
        {/* Bun sesame seeds */}
        <Ellipse cx={target.x + 20} cy={target.y + 10} rx={4} ry={2} fill="#F5F5DC" />
        <Ellipse cx={target.x + 50} cy={target.y + 15} rx={4} ry={2} fill="#F5F5DC" />
        <Ellipse cx={target.x + 80} cy={target.y + 8} rx={4} ry={2} fill="#F5F5DC" />
        <Ellipse cx={target.x + 35} cy={target.y + 25} rx={4} ry={2} fill="#F5F5DC" />
        <Ellipse cx={target.x + 65} cy={target.y + 28} rx={4} ry={2} fill="#F5F5DC" />
      </G>
    );
  };

  // Render hazards
  const renderHazards = () => {
    return level.hazards.map((hazard, index) => {
      if (hazard.type === 'knife') {
        return (
          <G
            key={`hazard-${index}`}
            transform={`translate(${hazard.x}, ${hazard.y}) rotate(${hazard.rotation || 0})`}
          >
            {/* Blade */}
            <Polygon
              points={`${-hazard.width / 2},0 ${hazard.width / 3},${-hazard.height / 2} ${hazard.width / 3},${hazard.height / 2}`}
              fill="#4A4A4A"
            />
            {/* Handle */}
            <Rect
              x={hazard.width / 3}
              y={-hazard.height / 3}
              width={hazard.width / 3}
              height={hazard.height * 0.66}
              rx={3}
              fill="#8B4513"
            />
          </G>
        );
      } else if (hazard.type === 'fire') {
        return (
          <G key={`hazard-${index}`}>
            {/* Fire base */}
            <Ellipse
              cx={hazard.x}
              cy={hazard.y + hazard.height / 3}
              rx={hazard.width / 2}
              ry={hazard.height / 4}
              fill="#FF6600"
            />
            {/* Flames */}
            <Path
              d={`M ${hazard.x - hazard.width / 3} ${hazard.y + hazard.height / 3}
                  Q ${hazard.x - hazard.width / 4} ${hazard.y - hazard.height / 2}
                  ${hazard.x} ${hazard.y - hazard.height / 3}
                  Q ${hazard.x + hazard.width / 4} ${hazard.y - hazard.height / 2}
                  ${hazard.x + hazard.width / 3} ${hazard.y + hazard.height / 3}`}
              fill="#FF4400"
            />
            <Path
              d={`M ${hazard.x - hazard.width / 5} ${hazard.y + hazard.height / 4}
                  Q ${hazard.x} ${hazard.y - hazard.height / 3}
                  ${hazard.x + hazard.width / 5} ${hazard.y + hazard.height / 4}`}
              fill="#FFCC00"
            />
          </G>
        );
      }
      return null;
    });
  };

  // Render obstacles
  const renderObstacles = () => {
    return level.obstacles.map((obs, index) => (
      <Rect
        key={`obs-${index}`}
        x={obs.x}
        y={obs.y}
        width={obs.width}
        height={obs.height}
        rx={3}
        fill="#666666"
      />
    ));
  };

  // Render drawn shapes
  const renderDrawnShapes = () => {
    const allShapes = [...drawnShapes];
    if (currentPath.length > 1) {
      allShapes.push({
        id: 'current',
        points: currentPath,
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      });
    }

    return allShapes.map((shape) => {
      const pathData = shape.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');
      return (
        <Path
          key={shape.id}
          d={pathData}
          stroke="white"
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    });
  };

  // Draw limit indicator
  const drawLimitPercentage = (currentDrawLength / MAX_DRAW_LENGTH) * 100;

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Background */}
      {backgroundImage ? (
        <Image
          source={{ uri: backgroundImage }}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.defaultBackground} />
      )}

      {/* Game Canvas */}
      <GestureDetector gesture={panGesture}>
        <View style={styles.gameContainer}>
          <Svg 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            width={GAME_WIDTH} 
            height={GAME_HEIGHT} 
            viewBox={`0 0 ${GAME_WIDTH} ${GAME_HEIGHT}`}
          >
            {/* Drawn shapes */}
            {renderDrawnShapes()}
            
            {/* Game objects */}
            {renderDispenser()}
            {renderTarget()}
            {renderHazards()}
            {renderObstacles()}
            {renderPatty()}
          </Svg>
        </View>
      </GestureDetector>

      {/* UI Overlay */}
      <View style={styles.uiOverlay}>
        {/* Level indicator */}
        <View style={styles.levelContainer}>
          <Text style={styles.levelText}>Level {currentLevel + 1}</Text>
        </View>

        {/* Draw limit bar */}
        <View style={styles.drawLimitContainer}>
          <View style={styles.drawLimitBar}>
            <View
              style={[
                styles.drawLimitFill,
                {
                  width: `${drawLimitPercentage}%`,
                  backgroundColor:
                    drawLimitPercentage > 80
                      ? '#FF6B6B'
                      : drawLimitPercentage > 50
                      ? '#FFE66D'
                      : '#4ECDC4',
                },
              ]}
            />
          </View>
        </View>

        {/* Menu button */}
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowMenu(!showMenu)}
        >
          <Ionicons name="settings-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Instructions overlay */}
      {gameState === 'ready' && drawnShapes.length === 0 && (
        <View style={styles.instructionsOverlay}>
          <Text style={styles.instructionsText}>Draw to guide the patty!</Text>
          <Text style={styles.instructionsSubtext}>Draw a path, then release</Text>
        </View>
      )}

      {/* Win/Fail overlay */}
      {gameState === 'win' && (
        <View style={styles.resultOverlay}>
          <Text style={styles.winText}>Nice!</Text>
        </View>
      )}
      {gameState === 'fail' && (
        <View style={styles.resultOverlay}>
          <Text style={styles.failText}>Oops!</Text>
        </View>
      )}

      {/* Menu overlay */}
      {showMenu && (
        <View style={styles.menuOverlay}>
          <View style={styles.menuContent}>
            <Text style={styles.menuTitle}>Menu</Text>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={pickBackgroundImage}
            >
              <Ionicons name="image-outline" size={24} color="#333" />
              <Text style={styles.menuItemText}>Change Background</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setBackgroundImage(null);
                setShowMenu(false);
              }}
            >
              <Ionicons name="refresh-outline" size={24} color="#333" />
              <Text style={styles.menuItemText}>Reset Background</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                restartLevel();
                setShowMenu(false);
              }}
            >
              <Ionicons name="reload-outline" size={24} color="#333" />
              <Text style={styles.menuItemText}>Restart Level</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setCurrentLevel(0);
                restartLevel();
                setShowMenu(false);
              }}
            >
              <Ionicons name="home-outline" size={24} color="#333" />
              <Text style={styles.menuItemText}>Back to Level 1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.closeButton]}
              onPress={() => setShowMenu(false)}
            >
              <Ionicons name="close-outline" size={24} color="white" />
              <Text style={[styles.menuItemText, { color: 'white' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  defaultBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#8B5A2B',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gameContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  uiOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  levelText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  drawLimitContainer: {
    flex: 1,
    marginHorizontal: 15,
  },
  drawLimitBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  drawLimitFill: {
    height: '100%',
    borderRadius: 4,
  },
  menuButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 20,
  },
  instructionsOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionsText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  instructionsSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
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
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  winText: {
    color: '#4ECDC4',
    fontSize: 64,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  failText: {
    color: '#FF6B6B',
    fontSize: 64,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  menuTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 12,
  },
  menuItemText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#333',
  },
  closeButton: {
    backgroundColor: '#FF6B6B',
    marginTop: 8,
  },
});
