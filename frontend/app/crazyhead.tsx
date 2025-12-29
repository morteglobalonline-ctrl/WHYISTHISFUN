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
import Svg, { Path, Circle, Rect, G, Ellipse, Line, Polygon, Defs, ClipPath, Image as SvgImage, Pattern } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Physics constants (same as Dump It for consistency)
const GRAVITY = 0.55;
const AIR_FRICTION = 0.995;
const BOUNCE = 0.3;
const MAX_ARROW_LENGTH = 160;
const LAUNCH_POWER_MULTIPLIER = 0.22;

// Level configurations (same as Dump It)
const LEVEL_CONFIGS = [
  { required: 2 },   // Level 1
  { required: 3 },   // Level 2
  { required: 4 },   // Level 3
  { required: 5 },   // Level 4
  { required: 7 },   // Level 5
];

// Crazy Head specific items with hit effects
interface CrazyHeadItem {
  id: string;
  name: string;
  icon: string;
  radius: number;
  colors: { primary: string; secondary: string; accent: string };
  hitEffect: 'splat' | 'slap' | 'grease' | 'bounce' | 'crack';
  sticks: boolean; // Does the item stick to face on hit?
}

const CRAZY_HEAD_ITEMS: CrazyHeadItem[] = [
  {
    id: 'poop',
    name: 'Poop',
    icon: 'emoticon-poop',
    radius: 30,
    colors: { primary: '#5D4037', secondary: '#3E2723', accent: '#8D6E63' },
    hitEffect: 'splat',
    sticks: true,
  },
  {
    id: 'money',
    name: 'Money',
    icon: 'cash',
    radius: 28,
    colors: { primary: '#2E7D32', secondary: '#1B5E20', accent: '#A5D6A7' },
    hitEffect: 'slap',
    sticks: false,
  },
  {
    id: 'patty',
    name: 'Patty',
    icon: 'hamburger',
    radius: 32,
    colors: { primary: '#6B5344', secondary: '#4E3B31', accent: '#8D7B6C' },
    hitEffect: 'grease',
    sticks: true,
  },
  {
    id: 'teddy',
    name: 'Teddy',
    icon: 'teddy-bear',
    radius: 34,
    colors: { primary: '#A1887F', secondary: '#8D6E63', accent: '#D7CCC8' },
    hitEffect: 'bounce',
    sticks: false,
  },
  {
    id: 'phone',
    name: 'Phone',
    icon: 'cellphone',
    radius: 26,
    colors: { primary: '#37474F', secondary: '#263238', accent: '#78909C' },
    hitEffect: 'crack',
    sticks: false,
  },
];

interface Point {
  x: number;
  y: number;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  itemId: string;
  isActive: boolean;
  hasHit: boolean;
}

interface HitEffect {
  id: string;
  type: 'splat' | 'slap' | 'grease' | 'bounce' | 'crack';
  x: number;
  y: number;
  rotation: number;
  itemId: string;
}

interface CrazyHeadGameProps {
  onBack: () => void;
}

const TOTAL_LEVELS = 5;

export default function CrazyHeadGame({ onBack }: CrazyHeadGameProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const GAME_WIDTH = windowWidth;
  const GAME_HEIGHT = windowHeight;

  // Character positioning
  const CHARACTER_X = GAME_WIDTH * 0.5;
  const CHARACTER_Y = GAME_HEIGHT * 0.45;
  const HEAD_RADIUS = 55;
  const HEAD_CENTER_HITBOX = HEAD_RADIUS * 0.7; // Only center 70% counts as hit

  // Game state
  const [currentLevel, setCurrentLevel] = useState(0);
  const [gameState, setGameState] = useState<'setup' | 'ready' | 'aiming' | 'flying' | 'win' | 'fail'>('setup');
  const [headshots, setHeadshots] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string>('poop');

  // Head customization
  const [headImage, setHeadImage] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<Point>({ x: 0.5, y: 0.5 });
  const [showFocusSelector, setShowFocusSelector] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [tempFocusPoint, setTempFocusPoint] = useState<Point>({ x: 0.5, y: 0.5 });
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);

  // Projectile
  const [projectile, setProjectile] = useState<Projectile | null>(null);
  const projectileRef = useRef<Projectile | null>(null);

  // Hit effects (persist per level)
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);

  // Character reactions
  const [reactionType, setReactionType] = useState<string | null>(null);
  const [headOffset, setHeadOffset] = useState<Point>({ x: 0, y: 0 });

  // Aiming
  const [aimStart, setAimStart] = useState<Point | null>(null);
  const [aimEnd, setAimEnd] = useState<Point | null>(null);

  // Refs
  const gameLoopRef = useRef<number | null>(null);
  const headshotsRef = useRef(0);
  const hasStartedPlayingRef = useRef(false);

  const levelConfig = LEVEL_CONFIGS[currentLevel] || LEVEL_CONFIGS[0];
  const currentItem = CRAZY_HEAD_ITEMS.find(i => i.id === selectedItemId) || CRAZY_HEAD_ITEMS[0];

  // Launcher position (bottom left)
  const LAUNCHER_X = GAME_WIDTH * 0.15;
  const LAUNCHER_Y = GAME_HEIGHT * 0.85;

  // Pick head image
  const pickHeadImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setTempImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setTempFocusPoint({ x: 0.5, y: 0.5 });
      setShowFocusSelector(true);
    }
  };

  // Confirm focus point selection
  const confirmFocusPoint = () => {
    if (tempImage) {
      setHeadImage(tempImage);
      setFocusPoint(tempFocusPoint);
      setShowFocusSelector(false);
      setTempImage(null);
      setHasStartedPlaying(true);
      if (gameState === 'setup') {
        setGameState('ready');
      }
    }
  };

  // Spawn projectile
  const spawnProjectile = useCallback(() => {
    const item = CRAZY_HEAD_ITEMS.find(i => i.id === selectedItemId) || CRAZY_HEAD_ITEMS[0];
    const newProjectile: Projectile = {
      id: Date.now().toString(),
      x: LAUNCHER_X,
      y: LAUNCHER_Y - 40,
      vx: 0,
      vy: 0,
      radius: item.radius,
      rotation: 0,
      rotationSpeed: 0,
      itemId: selectedItemId,
      isActive: true,
      hasHit: false,
    };
    projectileRef.current = newProjectile;
    setProjectile(newProjectile);
    setGameState('aiming');
  }, [selectedItemId, LAUNCHER_X, LAUNCHER_Y]);

  // Launch projectile
  const launchProjectile = useCallback((direction: Point, power: number) => {
    if (!projectileRef.current) return;

    const p = { ...projectileRef.current };
    p.vx = direction.x * power * LAUNCH_POWER_MULTIPLIER;
    p.vy = direction.y * power * LAUNCH_POWER_MULTIPLIER - 8;
    p.rotationSpeed = direction.x * 0.1;

    projectileRef.current = p;
    setProjectile(p);
    setGameState('flying');
    setAimStart(null);
    setAimEnd(null);
  }, []);

  // Check head collision
  const checkHeadCollision = useCallback((p: Projectile): 'center' | 'edge' | 'none' => {
    const headX = CHARACTER_X + headOffset.x;
    const headY = CHARACTER_Y - 60 + headOffset.y; // Head is above body center

    const dx = p.x - headX;
    const dy = p.y - headY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if hit center (counts as headshot)
    if (distance < HEAD_CENTER_HITBOX + p.radius * 0.5) {
      return 'center';
    }

    // Check if hit edge of head (doesn't count)
    if (distance < HEAD_RADIUS + p.radius * 0.5) {
      return 'edge';
    }

    return 'none';
  }, [CHARACTER_X, CHARACTER_Y, headOffset, HEAD_CENTER_HITBOX, HEAD_RADIUS]);

  // Apply hit effect
  const applyHitEffect = useCallback((p: Projectile) => {
    const item = CRAZY_HEAD_ITEMS.find(i => i.id === p.itemId) || CRAZY_HEAD_ITEMS[0];
    
    // Add visual effect
    if (item.sticks) {
      const headX = CHARACTER_X + headOffset.x;
      const headY = CHARACTER_Y - 60 + headOffset.y;
      const angle = Math.atan2(p.y - headY, p.x - headX);
      
      setHitEffects(prev => [...prev, {
        id: Date.now().toString(),
        type: item.hitEffect,
        x: (p.x - headX) * 0.6, // Position relative to head center
        y: (p.y - headY) * 0.6,
        rotation: angle * 180 / Math.PI,
        itemId: p.itemId,
      }]);
    }

    // Trigger reaction
    setReactionType(item.hitEffect);
    
    // Head recoil based on effect
    if (item.hitEffect === 'slap' || item.hitEffect === 'crack') {
      setHeadOffset({ x: p.vx > 0 ? 8 : -8, y: -5 });
      setTimeout(() => setHeadOffset({ x: 0, y: 0 }), 200);
    } else if (item.hitEffect === 'bounce') {
      setHeadOffset({ x: 0, y: -10 });
      setTimeout(() => setHeadOffset({ x: 0, y: 0 }), 150);
    }

    // Clear reaction after delay
    setTimeout(() => setReactionType(null), 500);
  }, [CHARACTER_X, CHARACTER_Y, headOffset]);

  // Handle successful headshot
  const handleHeadshot = useCallback(() => {
    const newCount = headshotsRef.current + 1;
    headshotsRef.current = newCount;
    setHeadshots(newCount);

    // Check win condition
    if (newCount >= levelConfig.required) {
      setGameState('win');
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      setTimeout(() => {
        nextLevel();
      }, 2000);
    } else {
      // Ready for next throw
      setTimeout(() => {
        projectileRef.current = null;
        setProjectile(null);
        setGameState('ready');
      }, 500);
    }
  }, [levelConfig.required]);

  // Restart level - MUST be defined before handleMiss
  const restartLevel = useCallback(() => {
    setHeadshots(0);
    headshotsRef.current = 0;
    setProjectile(null);
    projectileRef.current = null;
    setHitEffects([]);
    setReactionType(null);
    setHeadOffset({ x: 0, y: 0 });
    setAimStart(null);
    setAimEnd(null);
    setGameState(hasStartedPlayingRef.current ? 'ready' : 'setup');
  }, []);

  // Handle miss
  const handleMiss = useCallback(() => {
    setGameState('fail');
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    setTimeout(() => {
      restartLevel();
    }, 1500);
  }, [restartLevel]);

  // Physics update
  const updatePhysics = useCallback(() => {
    if (!projectileRef.current || gameState !== 'flying') return;

    const p = { ...projectileRef.current };

    // Apply gravity
    p.vy += GRAVITY;

    // Apply velocity
    p.x += p.vx;
    p.y += p.vy;

    // Air friction
    p.vx *= AIR_FRICTION;

    // Update rotation
    p.rotation += p.rotationSpeed;

    // Check head collision
    if (!p.hasHit) {
      const collision = checkHeadCollision(p);
      
      if (collision === 'center') {
        // Headshot!
        p.hasHit = true;
        applyHitEffect(p);
        handleHeadshot();
        projectileRef.current = p;
        setProjectile(p);
        return;
      } else if (collision === 'edge') {
        // Hit edge - bounce off
        p.vx = -p.vx * BOUNCE;
        p.vy = -p.vy * BOUNCE * 0.5;
        p.rotationSpeed = -p.rotationSpeed;
      }
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

    // Fall off screen or hit ground = miss
    if (p.y > GAME_HEIGHT + 50) {
      handleMiss();
      return;
    }

    // Hit ground (bottom of screen)
    if (p.y + p.radius > GAME_HEIGHT - 30 && !p.hasHit) {
      handleMiss();
      return;
    }

    projectileRef.current = p;
    setProjectile(p);
  }, [gameState, GAME_WIDTH, GAME_HEIGHT, checkHeadCollision, applyHitEffect, handleHeadshot, handleMiss]);

  // Game loop
  useEffect(() => {
    if (gameState === 'flying') {
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

  // Next level
  const nextLevel = useCallback(() => {
    if (currentLevel < TOTAL_LEVELS - 1) {
      setCurrentLevel(currentLevel + 1);
    } else {
      setCurrentLevel(0); // Loop back
    }
    setHeadshots(0);
    headshotsRef.current = 0;
    setProjectile(null);
    projectileRef.current = null;
    setHitEffects([]);
    setReactionType(null);
    setHeadOffset({ x: 0, y: 0 });
    setAimStart(null);
    setAimEnd(null);
    setGameState('ready');
  }, [currentLevel]);

  // Touch handlers
  const onTouchStart = useCallback((e: any) => {
    if (gameState === 'setup') return;
    
    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;

    if (gameState === 'ready') {
      spawnProjectile();
      setAimStart({ x, y });
      setAimEnd({ x, y });
    } else if (gameState === 'aiming') {
      setAimStart({ x, y });
      setAimEnd({ x, y });
    }
  }, [gameState, spawnProjectile]);

  const onTouchMove = useCallback((e: any) => {
    if (gameState !== 'aiming' || !aimStart) return;

    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;

    setAimEnd({ x, y });
  }, [gameState, aimStart]);

  const onTouchEnd = useCallback(() => {
    if (gameState !== 'aiming' || !aimStart || !aimEnd) return;

    const dx = aimStart.x - aimEnd.x;
    const dy = aimStart.y - aimEnd.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 25) {
      const power = Math.min(distance, MAX_ARROW_LENGTH);
      const direction = { x: dx / distance, y: dy / distance };
      launchProjectile(direction, power);
    } else {
      // Cancel - return to ready
      setAimStart(null);
      setAimEnd(null);
      projectileRef.current = null;
      setProjectile(null);
      setGameState('ready');
    }
  }, [gameState, aimStart, aimEnd, launchProjectile]);

  // Calculate aim arrow
  const getAimArrow = useCallback(() => {
    if (!aimStart || !aimEnd || gameState !== 'aiming' || !projectile) return null;

    const dx = aimStart.x - aimEnd.x;
    const dy = aimStart.y - aimEnd.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 15) return null;

    const clampedDistance = Math.min(distance, MAX_ARROW_LENGTH);
    const dirX = dx / distance;
    const dirY = dy / distance;

    const startX = projectile.x;
    const startY = projectile.y;
    const endX = startX + dirX * clampedDistance;
    const endY = startY + dirY * clampedDistance;

    // Trajectory preview
    const trajectoryPoints: Point[] = [];
    const launchVx = dirX * clampedDistance * LAUNCH_POWER_MULTIPLIER;
    const launchVy = dirY * clampedDistance * LAUNCH_POWER_MULTIPLIER - 8;

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
  }, [aimStart, aimEnd, gameState, projectile, GAME_HEIGHT, GAME_WIDTH]);

  // Render stick figure character
  const renderCharacter = () => {
    const cx = CHARACTER_X;
    const cy = CHARACTER_Y;
    const headY = cy - 60 + headOffset.y;
    const headX = cx + headOffset.x;

    return (
      <G>
        {/* Body */}
        <Line x1={cx} y1={cy - 20} x2={cx} y2={cy + 60} stroke="#333" strokeWidth={6} strokeLinecap="round" />
        
        {/* Arms */}
        <Line x1={cx} y1={cy} x2={cx - 45} y2={cy + 35} stroke="#333" strokeWidth={5} strokeLinecap="round" />
        <Line x1={cx} y1={cy} x2={cx + 45} y2={cy + 35} stroke="#333" strokeWidth={5} strokeLinecap="round" />
        
        {/* Legs */}
        <Line x1={cx} y1={cy + 60} x2={cx - 35} y2={cy + 120} stroke="#333" strokeWidth={5} strokeLinecap="round" />
        <Line x1={cx} y1={cy + 60} x2={cx + 35} y2={cy + 120} stroke="#333" strokeWidth={5} strokeLinecap="round" />
        
        {/* Head base (circle) */}
        <Circle cx={headX} cy={headY} r={HEAD_RADIUS} fill="#FFE0B2" stroke="#333" strokeWidth={3} />
        
        {/* Head image (if uploaded) */}
        {headImage && (
          <G>
            <Defs>
              <ClipPath id="headClip">
                <Circle cx={headX} cy={headY} r={HEAD_RADIUS - 3} />
              </ClipPath>
            </Defs>
            <SvgImage
              x={headX - HEAD_RADIUS}
              y={headY - HEAD_RADIUS}
              width={HEAD_RADIUS * 2}
              height={HEAD_RADIUS * 2}
              href={headImage}
              clipPath="url(#headClip)"
              preserveAspectRatio="xMidYMid slice"
            />
          </G>
        )}
        
        {/* Default face (if no image) */}
        {!headImage && (
          <>
            {/* Eyes */}
            <Circle cx={headX - 18} cy={headY - 8} r={8} fill="white" />
            <Circle cx={headX + 18} cy={headY - 8} r={8} fill="white" />
            <Circle cx={headX - 16} cy={headY - 6} r={4} fill="#333" />
            <Circle cx={headX + 20} cy={headY - 6} r={4} fill="#333" />
            
            {/* Mouth */}
            <Path
              d={reactionType === 'slap' || reactionType === 'crack' 
                ? `M ${headX - 15} ${headY + 25} Q ${headX} ${headY + 15} ${headX + 15} ${headY + 25}`
                : `M ${headX - 15} ${headY + 20} Q ${headX} ${headY + 30} ${headX + 15} ${headY + 20}`
              }
              stroke="#333"
              strokeWidth={3}
              fill="none"
            />
          </>
        )}

        {/* Hit effects on face */}
        {hitEffects.map(effect => renderHitEffect(effect, headX, headY))}

        {/* Reaction effects */}
        {reactionType === 'slap' && (
          <G>
            <Path d={`M ${headX + 40} ${headY - 20} l 15 -10 l -5 5 l 15 -5`} stroke="#FFD700" strokeWidth={3} />
            <Path d={`M ${headX - 50} ${headY - 15} l -15 -8 l 5 5 l -15 -3`} stroke="#FFD700" strokeWidth={3} />
          </G>
        )}
        
        {reactionType === 'crack' && (
          <G>
            <Circle cx={headX + 35} cy={headY - 25} r={12} fill="none" stroke="#FF0000" strokeWidth={2} opacity={0.7} />
            <Circle cx={headX - 40} cy={headY - 20} r={10} fill="none" stroke="#FF0000" strokeWidth={2} opacity={0.7} />
          </G>
        )}
      </G>
    );
  };

  // Render individual hit effect
  const renderHitEffect = (effect: HitEffect, headX: number, headY: number) => {
    const x = headX + effect.x;
    const y = headY + effect.y;

    switch (effect.type) {
      case 'splat':
        return (
          <G key={effect.id}>
            <Ellipse cx={x} cy={y} rx={18} ry={14} fill="#5D4037" opacity={0.85} />
            <Ellipse cx={x - 8} cy={y + 5} rx={8} ry={6} fill="#4E342E" opacity={0.7} />
            <Ellipse cx={x + 10} cy={y - 3} rx={6} ry={4} fill="#3E2723" opacity={0.6} />
          </G>
        );
      case 'grease':
        return (
          <G key={effect.id}>
            <Ellipse cx={x} cy={y} rx={20} ry={16} fill="#FFD54F" opacity={0.4} />
            <Ellipse cx={x + 5} cy={y - 5} rx={8} ry={6} fill="white" opacity={0.3} />
          </G>
        );
      default:
        return null;
    }
  };

  // Render projectile
  const renderProjectile = () => {
    if (!projectile || !projectile.isActive) return null;

    const p = projectile;
    const item = CRAZY_HEAD_ITEMS.find(i => i.id === p.itemId) || CRAZY_HEAD_ITEMS[0];

    return (
      <G transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation * 180 / Math.PI})`}>
        {/* Shadow */}
        <Ellipse cx={0} cy={p.radius + 5} rx={p.radius * 0.7} ry={p.radius * 0.3} fill="rgba(0,0,0,0.2)" />

        {/* Item rendering */}
        {item.id === 'poop' && (
          <>
            <Ellipse cx={0} cy={p.radius * 0.2} rx={p.radius * 0.9} ry={p.radius * 0.4} fill={item.colors.primary} />
            <Ellipse cx={0} cy={-p.radius * 0.1} rx={p.radius * 0.7} ry={p.radius * 0.35} fill={item.colors.primary} />
            <Ellipse cx={0} cy={-p.radius * 0.4} rx={p.radius * 0.5} ry={p.radius * 0.3} fill={item.colors.primary} />
            <Ellipse cx={0} cy={-p.radius * 0.65} rx={p.radius * 0.25} ry={p.radius * 0.2} fill={item.colors.primary} />
            <Circle cx={-6} cy={-3} r={4} fill="white" />
            <Circle cx={6} cy={-3} r={4} fill="white" />
            <Circle cx={-5} cy={-2} r={2} fill="#333" />
            <Circle cx={7} cy={-2} r={2} fill="#333" />
          </>
        )}

        {item.id === 'money' && (
          <>
            <Rect x={-p.radius} y={-p.radius * 0.6} width={p.radius * 2} height={p.radius * 1.2} rx={3} fill={item.colors.primary} />
            <Circle cx={0} cy={0} r={p.radius * 0.4} fill={item.colors.accent} />
            <Text x={0} y={4} textAnchor="middle" fill={item.colors.secondary} fontSize={14} fontWeight="bold">$</Text>
          </>
        )}

        {item.id === 'patty' && (
          <>
            <Ellipse cx={0} cy={0} rx={p.radius} ry={p.radius * 0.45} fill={item.colors.primary} />
            <Ellipse cx={-8} cy={-3} rx={8} ry={5} fill={item.colors.secondary} opacity={0.5} />
            <Ellipse cx={10} cy={2} rx={6} ry={4} fill={item.colors.secondary} opacity={0.5} />
          </>
        )}

        {item.id === 'teddy' && (
          <>
            <Circle cx={0} cy={0} r={p.radius * 0.7} fill={item.colors.primary} />
            <Circle cx={-p.radius * 0.5} cy={-p.radius * 0.5} r={p.radius * 0.25} fill={item.colors.primary} />
            <Circle cx={p.radius * 0.5} cy={-p.radius * 0.5} r={p.radius * 0.25} fill={item.colors.primary} />
            <Circle cx={-p.radius * 0.5} cy={-p.radius * 0.5} r={p.radius * 0.15} fill={item.colors.secondary} />
            <Circle cx={p.radius * 0.5} cy={-p.radius * 0.5} r={p.radius * 0.15} fill={item.colors.secondary} />
            <Ellipse cx={0} cy={p.radius * 0.1} rx={p.radius * 0.3} ry={p.radius * 0.2} fill={item.colors.accent} />
            <Circle cx={-8} cy={-5} r={3} fill="#333" />
            <Circle cx={8} cy={-5} r={3} fill="#333" />
            <Circle cx={0} cy={3} r={4} fill="#333" />
          </>
        )}

        {item.id === 'phone' && (
          <>
            <Rect x={-p.radius * 0.5} y={-p.radius * 0.8} width={p.radius} height={p.radius * 1.6} rx={4} fill={item.colors.primary} />
            <Rect x={-p.radius * 0.4} y={-p.radius * 0.6} width={p.radius * 0.8} height={p.radius * 1.1} rx={2} fill="#1A1A1A" />
            <Line x1={-p.radius * 0.3} y1={-p.radius * 0.4} x2={p.radius * 0.2} y2={p.radius * 0.3} stroke="#666" strokeWidth={2} />
            <Line x1={p.radius * 0.1} y1={-p.radius * 0.5} x2={-p.radius * 0.15} y2={p.radius * 0.2} stroke="#666" strokeWidth={1.5} />
          </>
        )}
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
          <Polygon points="0,0 -18,-10 -18,10" fill={powerColor} />
        </G>
        {/* Power indicator */}
        <Circle cx={arrow.startX} cy={arrow.startY - 35} r={18} fill="rgba(0,0,0,0.6)" />
        <Text x={arrow.startX} y={arrow.startY - 30} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold">
          {Math.round(arrow.power * 100)}%
        </Text>
      </G>
    );
  };

  // Render launcher
  const renderLauncher = () => {
    return (
      <G>
        {/* Base */}
        <Rect x={LAUNCHER_X - 35} y={LAUNCHER_Y - 20} width={70} height={50} rx={8} fill="#455A64" />
        <Rect x={LAUNCHER_X - 25} y={LAUNCHER_Y - 30} width={50} height={20} rx={5} fill="#607D8B" />
        
        {/* Item preview */}
        {gameState === 'ready' && (
          <Circle cx={LAUNCHER_X} cy={LAUNCHER_Y - 40} r={20} fill={currentItem.colors.primary} stroke="#333" strokeWidth={2} />
        )}
      </G>
    );
  };

  // Render item selector bar
  const renderItemSelector = () => {
    return (
      <View style={styles.itemSelectorBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemSelectorContent}>
          {CRAZY_HEAD_ITEMS.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.itemSelectorItem,
                selectedItemId === item.id && styles.itemSelectorItemSelected,
              ]}
              onPress={() => setSelectedItemId(item.id)}
            >
              <View style={[styles.itemSelectorIcon, { backgroundColor: item.colors.primary }]}>
                <MaterialCommunityIcons name={item.icon as any} size={24} color="white" />
              </View>
              <Text style={styles.itemSelectorLabel}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Focus point selector modal
  const renderFocusSelector = () => (
    <Modal visible={showFocusSelector} animationType="slide" transparent={true}>
      <View style={styles.focusModalOverlay}>
        <View style={styles.focusModalContent}>
          <View style={styles.focusModalHeader}>
            <Text style={styles.focusModalTitle}>Select Focus Point</Text>
            <TouchableOpacity onPress={() => { setShowFocusSelector(false); setTempImage(null); }}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <Text style={styles.focusInstructions}>
            Drag the circle to center on the face you want in the head
          </Text>

          <View style={styles.focusImageContainer}>
            {tempImage && (
              <View
                style={styles.focusImageWrapper}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderMove={(e) => {
                  const touch = e.nativeEvent;
                  const x = Math.max(0, Math.min(1, touch.locationX / 280));
                  const y = Math.max(0, Math.min(1, touch.locationY / 280));
                  setTempFocusPoint({ x, y });
                }}
              >
                <Image source={{ uri: tempImage }} style={styles.focusImage} resizeMode="cover" />
                {/* Focus circle overlay */}
                <View
                  style={[
                    styles.focusCircle,
                    {
                      left: tempFocusPoint.x * 280 - 55,
                      top: tempFocusPoint.y * 280 - 55,
                    },
                  ]}
                />
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.confirmButton} onPress={confirmFocusPoint}>
            <Ionicons name="checkmark" size={24} color="white" />
            <Text style={styles.confirmButtonText}>Confirm Selection</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
          {renderCharacter()}
          {renderLauncher()}
          {renderProjectile()}
          {renderAimArrow()}
        </Svg>
      </View>

      {/* UI Overlay */}
      <View style={styles.uiOverlay}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>

        <View style={styles.levelContainer}>
          <Text style={styles.levelText}>Level {currentLevel + 1}</Text>
          <View style={styles.progressContainer}>
            <MaterialCommunityIcons name="head" size={18} color="#FF5722" />
            <Text style={styles.progressText}>{headshots}/{levelConfig.required}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.uploadHeadButton} onPress={pickHeadImage}>
          <Ionicons name="camera" size={20} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetButton} onPress={restartLevel}>
          <Ionicons name="reload" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Setup overlay (before head image is selected) */}
      {gameState === 'setup' && (
        <View style={styles.setupOverlay}>
          <MaterialCommunityIcons name="emoticon-cool" size={80} color="white" />
          <Text style={styles.setupTitle}>Crazy Head</Text>
          <Text style={styles.setupSubtitle}>Upload a face to begin!</Text>
          <TouchableOpacity style={styles.uploadButton} onPress={pickHeadImage}>
            <Ionicons name="camera-outline" size={28} color="white" />
            <Text style={styles.uploadButtonText}>Choose Head Image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={() => { hasStartedPlayingRef.current = true; setHasStartedPlaying(true); setGameState('ready'); }}>
            <Text style={styles.skipButtonText}>Play with Default Face</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ready hint */}
      {gameState === 'ready' && (
        <View style={styles.hintOverlay} pointerEvents="none">
          <Text style={styles.hintText}>Tap and drag to aim → Release to throw!</Text>
        </View>
      )}

      {/* Aiming hint */}
      {gameState === 'aiming' && (
        <View style={styles.hintOverlay} pointerEvents="none">
          <Text style={styles.hintText}>Aim for the HEAD!</Text>
        </View>
      )}

      {/* Win overlay */}
      {gameState === 'win' && (
        <View style={styles.resultOverlay}>
          <MaterialCommunityIcons name="trophy" size={80} color="#FFD700" />
          <Text style={styles.winText}>Level Clear!</Text>
          <Text style={styles.resultSubtext}>{levelConfig.required} headshots landed</Text>
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

      {/* Item selector bar */}
      {(gameState === 'ready' || gameState === 'aiming') && renderItemSelector()}

      {/* Focus selector modal */}
      {renderFocusSelector()}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2C3E50',
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 25,
    marginRight: 10,
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
    color: '#FF5722',
    fontSize: 16,
    fontWeight: 'bold',
  },
  uploadHeadButton: {
    backgroundColor: 'rgba(156, 39, 176, 0.85)',
    padding: 12,
    borderRadius: 25,
    marginLeft: 'auto',
    marginRight: 10,
  },
  resetButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 25,
  },
  setupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  setupTitle: {
    color: 'white',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 20,
  },
  setupSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    marginTop: 10,
    marginBottom: 30,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9C27B0',
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 30,
    gap: 12,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  skipButton: {
    marginTop: 20,
    padding: 12,
  },
  skipButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  hintOverlay: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: '#FFC107',
    fontSize: 17,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  winText: {
    color: '#FFD700',
    fontSize: 42,
    fontWeight: 'bold',
    marginTop: 15,
  },
  failText: {
    color: '#FF5722',
    fontSize: 42,
    fontWeight: 'bold',
    marginTop: 15,
  },
  resultSubtext: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
  },
  itemSelectorBar: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    height: 90,
  },
  itemSelectorContent: {
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'center',
  },
  itemSelectorItem: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 70,
  },
  itemSelectorItemSelected: {
    borderColor: '#FF5722',
    backgroundColor: 'rgba(255,87,34,0.25)',
  },
  itemSelectorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemSelectorLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  focusModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 340,
  },
  focusModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  focusModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  focusInstructions: {
    color: '#666',
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  focusImageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  focusImageWrapper: {
    width: 280,
    height: 280,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  focusImage: {
    width: '100%',
    height: '100%',
  },
  focusCircle: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    borderColor: '#FF5722',
    backgroundColor: 'rgba(255,87,34,0.2)',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
