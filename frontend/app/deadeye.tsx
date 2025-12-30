import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Rect, G, Ellipse, Defs, ClipPath, Image as SvgImage, Line, Path } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for high score
const BEST_DEADEYE_KEY = 'deadeye_bestScore';

// Target types
type TargetType = 'poop' | 'teddy' | 'smiley' | 'money' | 'custom';

interface TargetConfig {
  id: TargetType;
  name: string;
  icon: string;
  color: string;
  size: number;
}

const TARGET_CONFIGS: TargetConfig[] = [
  { id: 'poop', name: 'Poop', icon: 'emoticon-poop', color: '#5D4037', size: 50 },
  { id: 'teddy', name: 'Teddy', icon: 'teddy-bear', color: '#A1887F', size: 55 },
  { id: 'smiley', name: 'Smiley', icon: 'emoticon-happy', color: '#FFC107', size: 50 },
  { id: 'money', name: 'Money', icon: 'cash-multiple', color: '#4CAF50', size: 55 },
  { id: 'custom', name: 'Photo', icon: 'image', color: '#9C27B0', size: 55 },
];

interface Target {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: TargetType;
  size: number;
  wobblePhase: number;
  isHit: boolean;
  hitTime: number;
  opacity: number;
  scale: number;
}

interface HitEffect {
  id: string;
  x: number;
  y: number;
  type: TargetType;
  age: number;
  particles: { x: number; y: number; vx: number; vy: number; size: number; color: string }[];
}

interface DeadeyeProps {
  onBack: () => void;
}

export default function DeadeyeGame({ onBack }: DeadeyeProps) {
  const { width: GAME_WIDTH, height: GAME_HEIGHT } = useWindowDimensions();

  // Game bounds (scope area)
  const SCOPE_MARGIN = 60;
  const SCOPE_TOP = 120;
  const SCOPE_BOTTOM = GAME_HEIGHT - 150;

  // Game state
  const [gameState, setGameState] = useState<'select' | 'playing'>('select');
  const [selectedTarget, setSelectedTarget] = useState<TargetType>('poop');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [showCombo, setShowCombo] = useState(false);

  // Aiming state
  const [isAiming, setIsAiming] = useState(false);
  const [aimStart, setAimStart] = useState({ x: 0, y: 0 });
  const [aimCurrent, setAimCurrent] = useState({ x: 0, y: 0 });
  const [crosshairPos, setCrosshairPos] = useState({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });

  // Bullet state
  const [bulletFiring, setBulletFiring] = useState(false);
  const [bulletPos, setBulletPos] = useState({ x: 0, y: 0 });

  // Refs
  const targetsRef = useRef<Target[]>([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const bestScoreRef = useRef(0);
  const gameLoopRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const lastSpawnRef = useRef(0);

  // Load best score
  useEffect(() => {
    const loadBestScore = async () => {
      try {
        const stored = await AsyncStorage.getItem(BEST_DEADEYE_KEY);
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
      await AsyncStorage.setItem(BEST_DEADEYE_KEY, newBest.toString());
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
      setSelectedTarget('custom');
    }
  };

  // Spawn a new target
  const spawnTarget = useCallback(() => {
    const config = TARGET_CONFIGS.find(c => c.id === selectedTarget) || TARGET_CONFIGS[0];
    
    // Random spawn position along edges
    const side = Math.floor(Math.random() * 4);
    let x: number, y: number, vx: number, vy: number;
    
    const speed = 0.3 + Math.random() * 0.4; // Slow, calm movement
    
    switch (side) {
      case 0: // Top
        x = SCOPE_MARGIN + Math.random() * (GAME_WIDTH - SCOPE_MARGIN * 2);
        y = SCOPE_TOP;
        vx = (Math.random() - 0.5) * speed;
        vy = speed * 0.5;
        break;
      case 1: // Right
        x = GAME_WIDTH - SCOPE_MARGIN;
        y = SCOPE_TOP + Math.random() * (SCOPE_BOTTOM - SCOPE_TOP);
        vx = -speed * 0.5;
        vy = (Math.random() - 0.5) * speed;
        break;
      case 2: // Bottom
        x = SCOPE_MARGIN + Math.random() * (GAME_WIDTH - SCOPE_MARGIN * 2);
        y = SCOPE_BOTTOM;
        vx = (Math.random() - 0.5) * speed;
        vy = -speed * 0.5;
        break;
      default: // Left
        x = SCOPE_MARGIN;
        y = SCOPE_TOP + Math.random() * (SCOPE_BOTTOM - SCOPE_TOP);
        vx = speed * 0.5;
        vy = (Math.random() - 0.5) * speed;
        break;
    }

    const newTarget: Target = {
      id: `target-${Date.now()}-${Math.random()}`,
      x,
      y,
      vx,
      vy,
      type: selectedTarget,
      size: config.size * (0.9 + Math.random() * 0.3),
      wobblePhase: Math.random() * Math.PI * 2,
      isHit: false,
      hitTime: 0,
      opacity: 1,
      scale: 1,
    };

    return newTarget;
  }, [selectedTarget, GAME_WIDTH, SCOPE_TOP, SCOPE_BOTTOM, SCOPE_MARGIN]);

  // Create hit effect particles
  const createHitEffect = useCallback((target: Target): HitEffect => {
    const particles: HitEffect['particles'] = [];
    const config = TARGET_CONFIGS.find(c => c.id === target.type);
    
    // Different effects per target type
    const particleCount = target.type === 'money' ? 12 : 8;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 2 + Math.random() * 3;
      
      let color = config?.color || '#FFF';
      if (target.type === 'poop') {
        color = ['#5D4037', '#4E342E', '#3E2723'][Math.floor(Math.random() * 3)];
      } else if (target.type === 'money') {
        color = ['#4CAF50', '#81C784', '#2E7D32', '#FFC107'][Math.floor(Math.random() * 4)];
      } else if (target.type === 'teddy') {
        color = ['#A1887F', '#BCAAA4', '#8D6E63'][Math.floor(Math.random() * 3)];
      }
      
      particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: target.type === 'money' ? 8 + Math.random() * 6 : 5 + Math.random() * 5,
        color,
      });
    }

    return {
      id: `effect-${Date.now()}`,
      x: target.x,
      y: target.y,
      type: target.type,
      age: 0,
      particles,
    };
  }, []);

  // Start game
  const startGame = useCallback(() => {
    // Spawn initial targets
    const initialTargets: Target[] = [];
    for (let i = 0; i < 5; i++) {
      const t = spawnTarget();
      // Spread them out initially
      t.x = SCOPE_MARGIN + 50 + Math.random() * (GAME_WIDTH - SCOPE_MARGIN * 2 - 100);
      t.y = SCOPE_TOP + 50 + Math.random() * (SCOPE_BOTTOM - SCOPE_TOP - 100);
      initialTargets.push(t);
    }
    
    targetsRef.current = initialTargets;
    setTargets(initialTargets);
    scoreRef.current = 0;
    comboRef.current = 0;
    setScore(0);
    setCombo(0);
    setHitEffects([]);
    timeRef.current = 0;
    lastSpawnRef.current = 0;
    setCrosshairPos({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
    setGameState('playing');
  }, [spawnTarget, GAME_WIDTH, GAME_HEIGHT, SCOPE_TOP, SCOPE_BOTTOM, SCOPE_MARGIN]);

  // Check hit
  const checkHit = useCallback((shootX: number, shootY: number) => {
    let hitAny = false;
    const newEffects: HitEffect[] = [];

    const updatedTargets = targetsRef.current.map(target => {
      if (target.isHit) return target;

      const dx = shootX - target.x;
      const dy = shootY - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = target.size * 0.6;

      if (dist < hitRadius) {
        hitAny = true;
        scoreRef.current += 1;
        comboRef.current += 1;
        setScore(scoreRef.current);
        setCombo(comboRef.current);
        
        if (comboRef.current >= 3) {
          setShowCombo(true);
          setTimeout(() => setShowCombo(false), 800);
        }

        newEffects.push(createHitEffect(target));

        return {
          ...target,
          isHit: true,
          hitTime: timeRef.current,
        };
      }
      return target;
    });

    if (!hitAny) {
      comboRef.current = 0;
      setCombo(0);
    }

    targetsRef.current = updatedTargets;
    setTargets(updatedTargets);

    if (newEffects.length > 0) {
      setHitEffects(prev => [...prev, ...newEffects]);
    }
  }, [createHitEffect]);

  // Fire bullet
  const fireBullet = useCallback(() => {
    if (bulletFiring) return;

    setBulletFiring(true);
    setBulletPos({ ...crosshairPos });

    // Check hit immediately at crosshair position
    checkHit(crosshairPos.x, crosshairPos.y);

    // Reset bullet after short delay
    setTimeout(() => {
      setBulletFiring(false);
    }, 150);
  }, [crosshairPos, bulletFiring, checkHit]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      return;
    }

    const loop = () => {
      timeRef.current += 1;

      // Update targets
      let updatedTargets = targetsRef.current.map(target => {
        if (target.isHit) {
          // Fade out hit targets
          const fadeProgress = (timeRef.current - target.hitTime) / 30;
          return {
            ...target,
            opacity: Math.max(0, 1 - fadeProgress),
            scale: 1 + fadeProgress * 0.3,
          };
        }

        // Move target
        let newX = target.x + target.vx;
        let newY = target.y + target.vy;

        // Bounce off edges
        if (newX < SCOPE_MARGIN || newX > GAME_WIDTH - SCOPE_MARGIN) {
          target.vx *= -1;
          newX = Math.max(SCOPE_MARGIN, Math.min(GAME_WIDTH - SCOPE_MARGIN, newX));
        }
        if (newY < SCOPE_TOP || newY > SCOPE_BOTTOM) {
          target.vy *= -1;
          newY = Math.max(SCOPE_TOP, Math.min(SCOPE_BOTTOM, newY));
        }

        // Update wobble
        const newWobble = target.wobblePhase + 0.05;

        return {
          ...target,
          x: newX,
          y: newY,
          wobblePhase: newWobble,
        };
      });

      // Remove fully faded targets
      updatedTargets = updatedTargets.filter(t => t.opacity > 0.05);

      // Spawn new targets to maintain count
      if (timeRef.current - lastSpawnRef.current > 120 && updatedTargets.filter(t => !t.isHit).length < 5) {
        const newTarget = spawnTarget();
        updatedTargets.push(newTarget);
        lastSpawnRef.current = timeRef.current;
      }

      targetsRef.current = updatedTargets;
      setTargets(updatedTargets);

      // Update hit effects
      setHitEffects(prev => {
        return prev
          .map(effect => ({
            ...effect,
            age: effect.age + 1,
            particles: effect.particles.map(p => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
              vy: p.vy + 0.15, // Gravity
            })),
          }))
          .filter(effect => effect.age < 40);
      });

      // Endless mode - automatically update best score when exceeded
      if (scoreRef.current > bestScoreRef.current) {
        saveBestScore(scoreRef.current);
      }

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, spawnTarget, saveBestScore, GAME_WIDTH, SCOPE_TOP, SCOPE_BOTTOM, SCOPE_MARGIN]);

  // Touch handlers
  const onTouchStart = useCallback((e: any) => {
    if (gameState !== 'playing') return;

    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;

    setIsAiming(true);
    setAimStart({ x, y });
    setAimCurrent({ x, y });
  }, [gameState]);

  const onTouchMove = useCallback((e: any) => {
    if (gameState !== 'playing' || !isAiming) return;

    const touch = e.nativeEvent.touches?.[0] || e.nativeEvent;
    const x = touch.locationX ?? touch.pageX ?? touch.clientX ?? 0;
    const y = touch.locationY ?? touch.pageY ?? touch.clientY ?? 0;

    setAimCurrent({ x, y });

    // Move crosshair based on drag (inverted for natural feel)
    const sensitivity = 1.5;
    const dx = (x - aimStart.x) * sensitivity;
    const dy = (y - aimStart.y) * sensitivity;

    setCrosshairPos(prev => ({
      x: Math.max(SCOPE_MARGIN, Math.min(GAME_WIDTH - SCOPE_MARGIN, prev.x + dx * 0.1)),
      y: Math.max(SCOPE_TOP, Math.min(SCOPE_BOTTOM, prev.y + dy * 0.1)),
    }));

    setAimStart({ x, y });
  }, [gameState, isAiming, aimStart, GAME_WIDTH, SCOPE_TOP, SCOPE_BOTTOM, SCOPE_MARGIN]);

  const onTouchEnd = useCallback(() => {
    if (isAiming) {
      fireBullet();
    }
    setIsAiming(false);
  }, [isAiming, fireBullet]);

  // Render target
  const renderTarget = (target: Target) => {
    const config = TARGET_CONFIGS.find(c => c.id === target.type);
    const wobbleX = Math.sin(target.wobblePhase) * 3;
    const wobbleY = Math.cos(target.wobblePhase * 1.3) * 2;

    return (
      <G
        key={target.id}
        transform={`translate(${target.x + wobbleX}, ${target.y + wobbleY}) scale(${target.scale})`}
        opacity={target.opacity}
      >
        {target.type === 'poop' && (
          <>
            <Ellipse cx={0} cy={8} rx={18} ry={10} fill={target.isHit ? '#3E2723' : '#4E342E'} />
            <Ellipse cx={0} cy={2} rx={14} ry={9} fill={target.isHit ? '#4E342E' : '#5D4037'} />
            <Ellipse cx={0} cy={-5} rx={10} ry={6} fill={target.isHit ? '#5D4037' : '#6D4C41'} />
            <Ellipse cx={0} cy={-11} rx={5} ry={4} fill="#795548" />
            {!target.isHit && (
              <>
                <Circle cx={-5} cy={0} r={2.5} fill="white" />
                <Circle cx={5} cy={0} r={2.5} fill="white" />
                <Circle cx={-4} cy={1} r={1.2} fill="#333" />
                <Circle cx={6} cy={1} r={1.2} fill="#333" />
              </>
            )}
            {target.isHit && (
              <Path d="M -8 -2 L 8 2 M -8 2 L 8 -2" stroke="#3E2723" strokeWidth={3} />
            )}
          </>
        )}

        {target.type === 'teddy' && (
          <>
            <Circle cx={0} cy={0} r={18} fill={target.isHit ? '#8D6E63' : '#A1887F'} />
            <Circle cx={-12} cy={-12} r={7} fill="#A1887F" />
            <Circle cx={12} cy={-12} r={7} fill="#A1887F" />
            <Circle cx={-12} cy={-12} r={4} fill="#8D6E63" />
            <Circle cx={12} cy={-12} r={4} fill="#8D6E63" />
            <Ellipse cx={0} cy={3} rx={8} ry={5} fill="#D7CCC8" />
            {!target.isHit ? (
              <>
                <Circle cx={-6} cy={-4} r={2.5} fill="#333" />
                <Circle cx={6} cy={-4} r={2.5} fill="#333" />
                <Circle cx={0} cy={3} r={2.5} fill="#333" />
              </>
            ) : (
              <>
                <Line x1={-9} y1={-4} x2={-3} y2={-4} stroke="#333" strokeWidth={2} />
                <Line x1={3} y1={-4} x2={9} y2={-4} stroke="#333" strokeWidth={2} />
              </>
            )}
          </>
        )}

        {target.type === 'smiley' && (
          <>
            <Circle cx={0} cy={0} r={20} fill={target.isHit ? '#FFA000' : '#FFC107'} />
            <Circle cx={0} cy={0} r={18} fill={target.isHit ? '#FFB300' : '#FFCA28'} />
            {!target.isHit ? (
              <>
                <Circle cx={-6} cy={-4} r={3.5} fill="#333" />
                <Circle cx={6} cy={-4} r={3.5} fill="#333" />
                <Path d="M -9 6 Q 0 14 9 6" stroke="#333" strokeWidth={2.5} fill="none" />
              </>
            ) : (
              <>
                <Line x1={-9} y1={-6} x2={-3} y2={-2} stroke="#333" strokeWidth={2.5} />
                <Line x1={-9} y1={-2} x2={-3} y2={-6} stroke="#333" strokeWidth={2.5} />
                <Line x1={3} y1={-6} x2={9} y2={-2} stroke="#333" strokeWidth={2.5} />
                <Line x1={3} y1={-2} x2={9} y2={-6} stroke="#333" strokeWidth={2.5} />
                <Path d="M -8 8 Q 0 2 8 8" stroke="#333" strokeWidth={2.5} fill="none" />
              </>
            )}
          </>
        )}

        {target.type === 'money' && (
          <>
            <Rect x={-22} y={-12} width={44} height={24} rx={4} fill={target.isHit ? '#2E7D32' : '#4CAF50'} />
            <Rect x={-20} y={-10} width={40} height={20} rx={3} fill={target.isHit ? '#388E3C' : '#66BB6A'} />
            <Circle cx={0} cy={0} r={8} fill={target.isHit ? '#2E7D32' : '#4CAF50'} />
            <Text
              x={0}
              y={0}
              textAnchor="middle"
              alignmentBaseline="central"
              fill="white"
              fontSize={12}
              fontWeight="bold"
            >
              $
            </Text>
            {target.isHit && (
              <>
                <Line x1={-15} y1={-8} x2={15} y2={8} stroke="#1B5E20" strokeWidth={3} />
                <Line x1={-15} y1={8} x2={15} y2={-8} stroke="#1B5E20" strokeWidth={3} />
              </>
            )}
          </>
        )}

        {target.type === 'custom' && customImage && (
          <>
            <Defs>
              <ClipPath id={`clip-${target.id}`}>
                <Circle cx={0} cy={0} r={22} />
              </ClipPath>
            </Defs>
            <Circle cx={0} cy={0} r={24} fill="#9C27B0" />
            <SvgImage
              x={-22}
              y={-22}
              width={44}
              height={44}
              href={customImage}
              clipPath={`url(#clip-${target.id})`}
              preserveAspectRatio="xMidYMid slice"
            />
            <Circle cx={0} cy={0} r={22} fill="none" stroke="#7B1FA2" strokeWidth={3} />
            {target.isHit && (
              <>
                <Line x1={-18} y1={-18} x2={18} y2={18} stroke="rgba(0,0,0,0.5)" strokeWidth={4} />
                <Line x1={-18} y1={18} x2={18} y2={-18} stroke="rgba(0,0,0,0.5)" strokeWidth={4} />
                <Circle cx={0} cy={0} r={22} fill="rgba(0,0,0,0.3)" />
              </>
            )}
          </>
        )}

        {target.type === 'custom' && !customImage && (
          <>
            <Circle cx={0} cy={0} r={22} fill="#9C27B0" />
            <Circle cx={0} cy={0} r={20} fill="#AB47BC" />
            <Rect x={-8} y={-10} width={16} height={12} rx={2} fill="white" opacity={0.8} />
            <Circle cx={-3} cy={-5} r={3} fill="#E1BEE7" />
            <Path d="M -5 3 L 0 -2 L 5 3" fill="#C5CAE9" />
          </>
        )}
      </G>
    );
  };

  // Render hit effects
  const renderHitEffects = () => {
    return hitEffects.map(effect => (
      <G key={effect.id}>
        {effect.particles.map((p, i) => (
          <Circle
            key={i}
            cx={effect.x + p.x}
            cy={effect.y + p.y}
            r={p.size * (1 - effect.age / 40)}
            fill={p.color}
            opacity={1 - effect.age / 40}
          />
        ))}
      </G>
    ));
  };

  // Render crosshair / scope
  const renderCrosshair = () => {
    const size = 40;
    return (
      <G>
        {/* Outer circle */}
        <Circle
          cx={crosshairPos.x}
          cy={crosshairPos.y}
          r={size}
          fill="none"
          stroke="rgba(255,0,0,0.6)"
          strokeWidth={2}
        />
        {/* Inner circle */}
        <Circle
          cx={crosshairPos.x}
          cy={crosshairPos.y}
          r={size * 0.3}
          fill="none"
          stroke="rgba(255,0,0,0.8)"
          strokeWidth={1.5}
        />
        {/* Crosshair lines */}
        <Line
          x1={crosshairPos.x - size}
          y1={crosshairPos.y}
          x2={crosshairPos.x - size * 0.4}
          y2={crosshairPos.y}
          stroke="rgba(255,0,0,0.8)"
          strokeWidth={2}
        />
        <Line
          x1={crosshairPos.x + size * 0.4}
          y1={crosshairPos.y}
          x2={crosshairPos.x + size}
          y2={crosshairPos.y}
          stroke="rgba(255,0,0,0.8)"
          strokeWidth={2}
        />
        <Line
          x1={crosshairPos.x}
          y1={crosshairPos.y - size}
          x2={crosshairPos.x}
          y2={crosshairPos.y - size * 0.4}
          stroke="rgba(255,0,0,0.8)"
          strokeWidth={2}
        />
        <Line
          x1={crosshairPos.x}
          y1={crosshairPos.y + size * 0.4}
          x2={crosshairPos.x}
          y2={crosshairPos.y + size}
          stroke="rgba(255,0,0,0.8)"
          strokeWidth={2}
        />
        {/* Center dot */}
        <Circle
          cx={crosshairPos.x}
          cy={crosshairPos.y}
          r={3}
          fill="rgba(255,0,0,0.9)"
        />
      </G>
    );
  };

  // Render muzzle flash
  const renderMuzzleFlash = () => {
    if (!bulletFiring) return null;
    return (
      <G>
        <Circle
          cx={crosshairPos.x}
          cy={crosshairPos.y}
          r={25}
          fill="rgba(255,200,50,0.6)"
        />
        <Circle
          cx={crosshairPos.x}
          cy={crosshairPos.y}
          r={15}
          fill="rgba(255,255,200,0.8)"
        />
      </G>
    );
  };

  // Render selection screen
  const renderSelection = () => (
    <View style={styles.selectionOverlay}>
      <MaterialCommunityIcons name="crosshairs-gps" size={60} color="#E53935" />
      <Text style={styles.titleText}>Deadeye Fun</Text>
      <Text style={styles.subtitleText}>Pick your targets!</Text>

      <View style={styles.iconGrid}>
        {TARGET_CONFIGS.map(config => (
          <TouchableOpacity
            key={config.id}
            style={[
              styles.iconCard,
              selectedTarget === config.id && styles.iconCardSelected,
            ]}
            onPress={() => {
              if (config.id === 'custom') {
                pickCustomImage();
              } else {
                setSelectedTarget(config.id);
              }
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: config.color }]}>
              <MaterialCommunityIcons name={config.icon as any} size={28} color="white" />
            </View>
            <Text style={styles.iconName}>{config.name}</Text>
            {config.id === 'custom' && (
              <Text style={styles.uploadHint}>Tap to upload</Text>
            )}
            {selectedTarget === config.id && (
              <View style={styles.selectedBadge}>
                <Ionicons name="checkmark" size={12} color="white" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {customImage && selectedTarget === 'custom' && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>Your custom target!</Text>
          <Image source={{ uri: customImage }} style={styles.previewImage} />
        </View>
      )}

      <View style={styles.bestScoreContainer}>
        <MaterialCommunityIcons name="trophy" size={20} color="#FFD700" />
        <Text style={styles.bestScoreText}>Best: {bestScore}</Text>
      </View>

      <TouchableOpacity style={styles.startButton} onPress={startGame}>
        <MaterialCommunityIcons name="target" size={24} color="white" />
        <Text style={styles.startButtonText}>Start Hunting!</Text>
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
              {/* Scope frame overlay */}
              <Rect x={0} y={0} width={GAME_WIDTH} height={SCOPE_TOP - 20} fill="rgba(0,0,0,0.7)" />
              <Rect x={0} y={SCOPE_BOTTOM + 20} width={GAME_WIDTH} height={GAME_HEIGHT - SCOPE_BOTTOM - 20} fill="rgba(0,0,0,0.7)" />
              <Rect x={0} y={SCOPE_TOP - 20} width={SCOPE_MARGIN - 20} height={SCOPE_BOTTOM - SCOPE_TOP + 40} fill="rgba(0,0,0,0.7)" />
              <Rect x={GAME_WIDTH - SCOPE_MARGIN + 20} y={SCOPE_TOP - 20} width={SCOPE_MARGIN - 20} height={SCOPE_BOTTOM - SCOPE_TOP + 40} fill="rgba(0,0,0,0.7)" />
              
              {/* Scope border */}
              <Rect
                x={SCOPE_MARGIN - 20}
                y={SCOPE_TOP - 20}
                width={GAME_WIDTH - SCOPE_MARGIN * 2 + 40}
                height={SCOPE_BOTTOM - SCOPE_TOP + 40}
                fill="none"
                stroke="rgba(100,100,100,0.5)"
                strokeWidth={4}
                rx={10}
              />

              {/* Targets */}
              {targets.map(target => renderTarget(target))}

              {/* Hit effects */}
              {renderHitEffects()}

              {/* Crosshair */}
              {renderCrosshair()}

              {/* Muzzle flash */}
              {renderMuzzleFlash()}
            </>
          )}
        </Svg>
      </View>

      {/* UI Overlay */}
      {gameState === 'playing' && (
        <View style={styles.uiOverlay}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>

          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreText}>{score}</Text>
          </View>

          <View style={styles.endlessTag}>
            <Text style={styles.endlessText}>ENDLESS</Text>
          </View>

          <View style={styles.bestContainer}>
            <Text style={styles.bestLabel}>Best</Text>
            <Text style={styles.bestText}>{bestScore}</Text>
          </View>

          <TouchableOpacity style={styles.restartButton} onPress={startGame}>
            <Ionicons name="reload" size={22} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Combo feedback */}
      {showCombo && combo >= 3 && (
        <View style={styles.comboOverlay} pointerEvents="none">
          <Text style={styles.comboText}>{combo}x COMBO!</Text>
        </View>
      )}

      {/* Instructions */}
      {gameState === 'playing' && (
        <View style={styles.instructionOverlay} pointerEvents="none">
          <Text style={styles.instructionText}>Drag to aim • Release to shoot</Text>
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
    backgroundColor: '#1a237e',
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
    color: '#E53935',
    fontSize: 20,
    fontWeight: 'bold',
  },
  endlessTag: {
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 10,
  },
  endlessText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  bestContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 'auto',
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
    marginLeft: 10,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 35, 126, 0.95)',
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
    gap: 12,
    maxWidth: 340,
  },
  iconCard: {
    width: '30%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconCardSelected: {
    borderColor: '#E53935',
    backgroundColor: 'rgba(229, 57, 53, 0.2)',
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconName: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  uploadHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    marginTop: 2,
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#E53935',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  previewLabel: {
    color: '#E53935',
    fontSize: 13,
    marginBottom: 10,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#E53935',
  },
  bestScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  bestScoreText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E53935',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    marginTop: 25,
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
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  comboOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  comboText: {
    color: '#FFD700',
    fontSize: 32,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  completeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeTitle: {
    color: '#FFD700',
    fontSize: 32,
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
    backgroundColor: '#E53935',
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
  changeTargetButton: {
    marginTop: 15,
    padding: 10,
  },
  changeTargetText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
});
