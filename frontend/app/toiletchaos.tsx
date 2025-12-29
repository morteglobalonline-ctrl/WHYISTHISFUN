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
import Svg, { Path, Circle, Rect, G, Ellipse, Line, Polygon, Defs, ClipPath, Image as SvgImage, LinearGradient, Stop } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for high score
const BEST_PASS_KEY = 'toiletChaos_bestPass';

// Physics constants - gentle/relaxed feel
const GRAVITY = 0.35;
const FLAP_POWER = -7;
const SCROLL_SPEED = 2.5;
const OBSTACLE_GAP = 180; // Gap between top and bottom poop streams
const OBSTACLE_SPACING = 250; // Horizontal spacing between obstacle pairs

// Character types
type CharacterType = 'poop' | 'photoPoop' | 'doll' | 'balloon';

interface Character {
  id: CharacterType;
  name: string;
  icon: string;
  color: string;
  fallSpeed: number; // Multiplier for gravity
  flapPower: number; // Multiplier for flap
}

const CHARACTERS: Character[] = [
  { id: 'poop', name: '3D Poop', icon: 'emoticon-poop', color: '#5D4037', fallSpeed: 1, flapPower: 1 },
  { id: 'photoPoop', name: 'Photo Poop', icon: 'face-man', color: '#8D6E63', fallSpeed: 1, flapPower: 1 },
  { id: 'doll', name: 'Cartoon Doll', icon: 'robot-happy', color: '#E91E63', fallSpeed: 1.1, flapPower: 1.05 },
  { id: 'balloon', name: 'Balloon', icon: 'balloon', color: '#FF5722', fallSpeed: 0.7, flapPower: 0.85 },
];

interface Obstacle {
  x: number;
  gapY: number; // Center Y of the gap
  streamOffset: number; // Current vertical offset of poop streams
  streamPhase: number; // Phase for sinusoidal movement
  passed: boolean;
}

interface ToiletChaosProps {
  onBack: () => void;
}

export default function ToiletChaosGame({ onBack }: ToiletChaosProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const GAME_WIDTH = windowWidth;
  const GAME_HEIGHT = windowHeight;

  // Character size
  const CHAR_SIZE = 50;
  const CHAR_X = GAME_WIDTH * 0.25; // Fixed X position

  // Game state
  const [gameState, setGameState] = useState<'select' | 'playing' | 'splat'>('select');
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterType>('poop');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [score, setScore] = useState(0);

  // Player state
  const [playerY, setPlayerY] = useState(GAME_HEIGHT / 2);
  const [playerVY, setPlayerVY] = useState(0);
  const [playerRotation, setPlayerRotation] = useState(0);
  const [squishFactor, setSquishFactor] = useState(1);

  // Obstacles
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  
  // Animation frame
  const [gameTime, setGameTime] = useState(0);

  // Refs for game loop
  const gameLoopRef = useRef<number | null>(null);
  const playerYRef = useRef(GAME_HEIGHT / 2);
  const playerVYRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const scoreRef = useRef(0);
  const gameTimeRef = useRef(0);

  const currentChar = CHARACTERS.find(c => c.id === selectedCharacter) || CHARACTERS[0];

  // Pick custom image for photo poop
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
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCustomImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setSelectedCharacter('photoPoop');
    }
  };

  // Initialize obstacles
  const initObstacles = useCallback(() => {
    const newObstacles: Obstacle[] = [];
    for (let i = 0; i < 4; i++) {
      newObstacles.push({
        x: GAME_WIDTH + i * OBSTACLE_SPACING,
        gapY: GAME_HEIGHT * 0.3 + Math.random() * (GAME_HEIGHT * 0.4),
        streamOffset: 0,
        streamPhase: Math.random() * Math.PI * 2,
        passed: false,
      });
    }
    return newObstacles;
  }, [GAME_WIDTH, GAME_HEIGHT]);

  // Start game
  const startGame = useCallback(() => {
    playerYRef.current = GAME_HEIGHT / 2;
    playerVYRef.current = 0;
    scoreRef.current = 0;
    gameTimeRef.current = 0;
    obstaclesRef.current = initObstacles();
    
    setPlayerY(GAME_HEIGHT / 2);
    setPlayerVY(0);
    setScore(0);
    setGameTime(0);
    setObstacles(obstaclesRef.current);
    setSquishFactor(1);
    setPlayerRotation(0);
    setGameState('playing');
  }, [GAME_HEIGHT, initObstacles]);

  // Handle tap/flap
  const handleFlap = useCallback(() => {
    if (gameState === 'select') return;
    
    if (gameState === 'splat') {
      // Instant restart
      startGame();
      return;
    }

    if (gameState === 'playing') {
      const flapStrength = FLAP_POWER * currentChar.flapPower;
      playerVYRef.current = flapStrength;
      setPlayerVY(flapStrength);
      
      // Squish animation on flap
      setSquishFactor(0.8);
      setTimeout(() => setSquishFactor(1), 100);
    }
  }, [gameState, currentChar, startGame]);

  // Check collision
  const checkCollision = useCallback((py: number, obs: Obstacle[]): boolean => {
    const charRadius = CHAR_SIZE / 2;
    
    // Screen bounds
    if (py - charRadius < 0 || py + charRadius > GAME_HEIGHT) {
      return true;
    }

    // Check each obstacle
    for (const obstacle of obs) {
      // Only check obstacles that are near the player
      if (obstacle.x < CHAR_X - 60 || obstacle.x > CHAR_X + 60) continue;

      const toiletWidth = 50;
      const streamWidth = 30;
      
      // Calculate stream positions with movement
      const topStreamBottom = obstacle.gapY - OBSTACLE_GAP / 2 + obstacle.streamOffset;
      const bottomStreamTop = obstacle.gapY + OBSTACLE_GAP / 2 + obstacle.streamOffset;

      // Check toilet body collision (static)
      const toiletTop = 40;
      const toiletBottom = GAME_HEIGHT - 40;
      
      // Top toilet collision
      if (CHAR_X + charRadius > obstacle.x - toiletWidth / 2 &&
          CHAR_X - charRadius < obstacle.x + toiletWidth / 2 &&
          py - charRadius < toiletTop + 50) {
        return true;
      }
      
      // Bottom toilet collision
      if (CHAR_X + charRadius > obstacle.x - toiletWidth / 2 &&
          CHAR_X - charRadius < obstacle.x + toiletWidth / 2 &&
          py + charRadius > toiletBottom - 50) {
        return true;
      }

      // Poop stream collision (the moving part)
      if (CHAR_X + charRadius > obstacle.x - streamWidth / 2 &&
          CHAR_X - charRadius < obstacle.x + streamWidth / 2) {
        // Top stream
        if (py - charRadius < topStreamBottom) {
          return true;
        }
        // Bottom stream
        if (py + charRadius > bottomStreamTop) {
          return true;
        }
      }
    }

    return false;
  }, [CHAR_X, CHAR_SIZE, GAME_HEIGHT]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      return;
    }

    const loop = () => {
      // Update game time
      gameTimeRef.current += 1;
      setGameTime(gameTimeRef.current);

      // Apply gravity
      playerVYRef.current += GRAVITY * currentChar.fallSpeed;
      playerYRef.current += playerVYRef.current;

      // Update rotation based on velocity
      const targetRotation = Math.min(Math.max(playerVYRef.current * 3, -30), 60);
      setPlayerRotation(targetRotation);

      // Update obstacles
      const updatedObstacles = obstaclesRef.current.map(obs => {
        let newX = obs.x - SCROLL_SPEED;
        
        // Update poop stream movement (sinusoidal)
        const streamMovement = Math.sin(gameTimeRef.current * 0.03 + obs.streamPhase) * 25;
        
        // Check if passed
        let passed = obs.passed;
        if (!passed && newX + 30 < CHAR_X) {
          passed = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        }

        return {
          ...obs,
          x: newX,
          streamOffset: streamMovement,
          passed,
        };
      });

      // Recycle obstacles that go off screen
      const recycledObstacles = updatedObstacles.map(obs => {
        if (obs.x < -80) {
          const maxX = Math.max(...updatedObstacles.map(o => o.x));
          return {
            x: maxX + OBSTACLE_SPACING,
            gapY: GAME_HEIGHT * 0.25 + Math.random() * (GAME_HEIGHT * 0.5),
            streamOffset: 0,
            streamPhase: Math.random() * Math.PI * 2,
            passed: false,
          };
        }
        return obs;
      });

      obstaclesRef.current = recycledObstacles;

      // Check collision
      if (checkCollision(playerYRef.current, recycledObstacles)) {
        // Splat!
        setSquishFactor(1.5); // Squash effect
        setGameState('splat');
        return;
      }

      // Update state for render
      setPlayerY(playerYRef.current);
      setPlayerVY(playerVYRef.current);
      setObstacles(recycledObstacles);

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, currentChar, checkCollision, GAME_HEIGHT]);

  // Render 3D Poop character
  const renderPoopCharacter = (x: number, y: number, rotation: number, squish: number) => {
    return (
      <G transform={`translate(${x}, ${y}) rotate(${rotation}) scale(${squish}, ${2 - squish})`}>
        {/* Poop body - 3D effect with gradients */}
        <Defs>
          <LinearGradient id="poopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#8D6E63" />
            <Stop offset="50%" stopColor="#5D4037" />
            <Stop offset="100%" stopColor="#3E2723" />
          </LinearGradient>
        </Defs>
        
        {/* Shadow */}
        <Ellipse cx={3} cy={CHAR_SIZE/2 + 5} rx={CHAR_SIZE/2.5} ry={8} fill="rgba(0,0,0,0.2)" />
        
        {/* Base layer */}
        <Ellipse cx={0} cy={CHAR_SIZE/3} rx={CHAR_SIZE/2} ry={CHAR_SIZE/4} fill="#5D4037" />
        
        {/* Middle layer */}
        <Ellipse cx={0} cy={CHAR_SIZE/6} rx={CHAR_SIZE/2.5} ry={CHAR_SIZE/5} fill="#6D4C41" />
        
        {/* Top layer */}
        <Ellipse cx={0} cy={-CHAR_SIZE/8} rx={CHAR_SIZE/3.5} ry={CHAR_SIZE/6} fill="#795548" />
        
        {/* Peak */}
        <Ellipse cx={0} cy={-CHAR_SIZE/3.5} rx={CHAR_SIZE/6} ry={CHAR_SIZE/8} fill="#8D6E63" />
        
        {/* Eyes */}
        <Circle cx={-10} cy={5} r={6} fill="white" />
        <Circle cx={10} cy={5} r={6} fill="white" />
        <Circle cx={-8} cy={6} r={3} fill="#333" />
        <Circle cx={12} cy={6} r={3} fill="#333" />
        
        {/* Smile */}
        <Path d="M -8 18 Q 0 25 8 18" stroke="#3E2723" strokeWidth={2} fill="none" />
        
        {/* Highlight */}
        <Ellipse cx={-12} cy={-5} rx={4} ry={3} fill="rgba(255,255,255,0.3)" />
      </G>
    );
  };

  // Render Photo Poop character
  const renderPhotoPoopCharacter = (x: number, y: number, rotation: number, squish: number) => {
    return (
      <G transform={`translate(${x}, ${y}) rotate(${rotation}) scale(${squish}, ${2 - squish})`}>
        {/* Shadow */}
        <Ellipse cx={3} cy={CHAR_SIZE/2 + 5} rx={CHAR_SIZE/2.5} ry={8} fill="rgba(0,0,0,0.2)" />
        
        {/* Poop body */}
        <Ellipse cx={0} cy={CHAR_SIZE/3} rx={CHAR_SIZE/2} ry={CHAR_SIZE/4} fill="#5D4037" />
        <Ellipse cx={0} cy={CHAR_SIZE/6} rx={CHAR_SIZE/2.5} ry={CHAR_SIZE/5} fill="#6D4C41" />
        <Ellipse cx={0} cy={-CHAR_SIZE/8} rx={CHAR_SIZE/3.5} ry={CHAR_SIZE/6} fill="#795548" />
        <Ellipse cx={0} cy={-CHAR_SIZE/3.5} rx={CHAR_SIZE/6} ry={CHAR_SIZE/8} fill="#8D6E63" />
        
        {/* Photo face mapped onto poop surface */}
        {customImage && (
          <G>
            <Defs>
              <ClipPath id="faceClip">
                <Ellipse cx={0} cy={5} rx={22} ry={20} />
              </ClipPath>
            </Defs>
            <SvgImage
              x={-25}
              y={-18}
              width={50}
              height={50}
              href={customImage}
              clipPath="url(#faceClip)"
              preserveAspectRatio="xMidYMid slice"
              opacity={0.9}
            />
            {/* Curved overlay for 3D effect */}
            <Ellipse cx={0} cy={5} rx={22} ry={20} fill="none" stroke="#5D4037" strokeWidth={2} />
          </G>
        )}
        
        {/* Highlight */}
        <Ellipse cx={-12} cy={-5} rx={4} ry={3} fill="rgba(255,255,255,0.2)" />
      </G>
    );
  };

  // Render Doll character
  const renderDollCharacter = (x: number, y: number, rotation: number, squish: number) => {
    return (
      <G transform={`translate(${x}, ${y}) rotate(${rotation}) scale(${squish}, ${2 - squish})`}>
        {/* Shadow */}
        <Ellipse cx={3} cy={CHAR_SIZE/2 + 5} rx={CHAR_SIZE/2.5} ry={8} fill="rgba(0,0,0,0.2)" />
        
        {/* Body */}
        <Circle cx={0} cy={15} r={20} fill="#E91E63" />
        
        {/* Head */}
        <Circle cx={0} cy={-10} r={18} fill="#F8BBD9" />
        
        {/* Hair */}
        <Path d="M -15 -20 Q -20 -35 -5 -30 Q 5 -40 15 -30 Q 25 -35 15 -20" fill="#6D4C41" />
        
        {/* Eyes */}
        <Circle cx={-7} cy={-12} r={5} fill="white" />
        <Circle cx={7} cy={-12} r={5} fill="white" />
        <Circle cx={-6} cy={-11} r={2.5} fill="#333" />
        <Circle cx={8} cy={-11} r={2.5} fill="#333" />
        
        {/* Cheeks */}
        <Circle cx={-12} cy={-3} r={4} fill="#FFCDD2" opacity={0.7} />
        <Circle cx={12} cy={-3} r={4} fill="#FFCDD2" opacity={0.7} />
        
        {/* Smile */}
        <Path d="M -6 2 Q 0 8 6 2" stroke="#C2185B" strokeWidth={2} fill="none" />
        
        {/* Arms */}
        <Ellipse cx={-22} cy={15} rx={8} ry={6} fill="#F8BBD9" />
        <Ellipse cx={22} cy={15} rx={8} ry={6} fill="#F8BBD9" />
      </G>
    );
  };

  // Render Balloon character
  const renderBalloonCharacter = (x: number, y: number, rotation: number, squish: number) => {
    const wobble = Math.sin(gameTime * 0.1) * 3;
    
    return (
      <G transform={`translate(${x}, ${y}) rotate(${rotation + wobble}) scale(${squish}, ${2 - squish})`}>
        {/* String */}
        <Path d={`M 0 ${CHAR_SIZE/2} Q ${wobble} ${CHAR_SIZE/2 + 20} 0 ${CHAR_SIZE/2 + 35}`} stroke="#666" strokeWidth={1.5} fill="none" />
        
        {/* Balloon body */}
        <Defs>
          <LinearGradient id="balloonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FF8A65" />
            <Stop offset="50%" stopColor="#FF5722" />
            <Stop offset="100%" stopColor="#E64A19" />
          </LinearGradient>
        </Defs>
        
        {/* Shadow */}
        <Ellipse cx={3} cy={CHAR_SIZE/2 + 5} rx={CHAR_SIZE/2.5} ry={8} fill="rgba(0,0,0,0.15)" />
        
        {/* Main balloon */}
        <Ellipse cx={0} cy={0} rx={CHAR_SIZE/2} ry={CHAR_SIZE/1.8} fill="url(#balloonGrad)" />
        
        {/* Knot */}
        <Polygon points={`0,${CHAR_SIZE/2} -6,${CHAR_SIZE/2 + 8} 6,${CHAR_SIZE/2 + 8}`} fill="#E64A19" />
        
        {/* Face */}
        <Circle cx={-10} cy={-5} r={5} fill="white" />
        <Circle cx={10} cy={-5} r={5} fill="white" />
        <Circle cx={-9} cy={-4} r={2.5} fill="#333" />
        <Circle cx={11} cy={-4} r={2.5} fill="#333" />
        
        {/* Happy mouth */}
        <Path d="M -8 10 Q 0 18 8 10" stroke="#BF360C" strokeWidth={2} fill="none" />
        
        {/* Highlight */}
        <Ellipse cx={-15} cy={-15} rx={8} ry={6} fill="rgba(255,255,255,0.4)" />
      </G>
    );
  };

  // Render current character
  const renderCharacter = () => {
    switch (selectedCharacter) {
      case 'poop':
        return renderPoopCharacter(CHAR_X, playerY, playerRotation, squishFactor);
      case 'photoPoop':
        return renderPhotoPoopCharacter(CHAR_X, playerY, playerRotation, squishFactor);
      case 'doll':
        return renderDollCharacter(CHAR_X, playerY, playerRotation, squishFactor);
      case 'balloon':
        return renderBalloonCharacter(CHAR_X, playerY, playerRotation, squishFactor);
      default:
        return renderPoopCharacter(CHAR_X, playerY, playerRotation, squishFactor);
    }
  };

  // Render toilet with poop stream
  const renderObstacle = (obstacle: Obstacle, index: number) => {
    const toiletWidth = 50;
    const toiletHeight = 60;
    
    const topStreamBottom = obstacle.gapY - OBSTACLE_GAP / 2 + obstacle.streamOffset;
    const bottomStreamTop = obstacle.gapY + OBSTACLE_GAP / 2 + obstacle.streamOffset;

    return (
      <G key={index}>
        {/* Top Toilet */}
        <G transform={`translate(${obstacle.x}, 30)`}>
          {/* Toilet tank */}
          <Rect x={-toiletWidth/2 - 5} y={-10} width={toiletWidth + 10} height={30} rx={5} fill="#E0E0E0" />
          {/* Toilet bowl */}
          <Ellipse cx={0} cy={35} rx={toiletWidth/2} ry={20} fill="#FAFAFA" stroke="#BDBDBD" strokeWidth={2} />
          <Ellipse cx={0} cy={30} rx={toiletWidth/2 - 5} ry={15} fill="#E0E0E0" />
          {/* Seat */}
          <Ellipse cx={0} cy={35} rx={toiletWidth/2 - 3} ry={12} fill="none" stroke="#9E9E9E" strokeWidth={3} />
        </G>

        {/* Top Poop Stream (moving) */}
        <G>
          {/* Stream body */}
          <Rect 
            x={obstacle.x - 15} 
            y={80} 
            width={30} 
            height={topStreamBottom - 80} 
            fill="#6D4C41"
            rx={8}
          />
          {/* Drip effect */}
          <Ellipse cx={obstacle.x} cy={topStreamBottom} rx={18} ry={12} fill="#5D4037" />
          <Ellipse cx={obstacle.x - 5} cy={topStreamBottom - 10} rx={5} ry={8} fill="#8D6E63" opacity={0.5} />
        </G>

        {/* Bottom Toilet */}
        <G transform={`translate(${obstacle.x}, ${GAME_HEIGHT - 30}) scale(1, -1)`}>
          {/* Toilet tank */}
          <Rect x={-toiletWidth/2 - 5} y={-10} width={toiletWidth + 10} height={30} rx={5} fill="#E0E0E0" />
          {/* Toilet bowl */}
          <Ellipse cx={0} cy={35} rx={toiletWidth/2} ry={20} fill="#FAFAFA" stroke="#BDBDBD" strokeWidth={2} />
          <Ellipse cx={0} cy={30} rx={toiletWidth/2 - 5} ry={15} fill="#E0E0E0" />
          {/* Seat */}
          <Ellipse cx={0} cy={35} rx={toiletWidth/2 - 3} ry={12} fill="none" stroke="#9E9E9E" strokeWidth={3} />
        </G>

        {/* Bottom Poop Stream (moving) */}
        <G>
          {/* Stream body */}
          <Rect 
            x={obstacle.x - 15} 
            y={bottomStreamTop} 
            width={30} 
            height={GAME_HEIGHT - 80 - bottomStreamTop} 
            fill="#6D4C41"
            rx={8}
          />
          {/* Drip effect */}
          <Ellipse cx={obstacle.x} cy={bottomStreamTop} rx={18} ry={12} fill="#5D4037" />
          <Ellipse cx={obstacle.x + 5} cy={bottomStreamTop + 10} rx={5} ry={8} fill="#8D6E63" opacity={0.5} />
        </G>
      </G>
    );
  };

  // Render character selection screen
  const renderSelectionScreen = () => (
    <View style={styles.selectionOverlay}>
      <MaterialCommunityIcons name="toilet" size={60} color="white" />
      <Text style={styles.titleText}>Toilet Chaos</Text>
      <Text style={styles.subtitleText}>Pick your flying friend!</Text>
      
      <View style={styles.characterGrid}>
        {CHARACTERS.map(char => (
          <TouchableOpacity
            key={char.id}
            style={[
              styles.characterCard,
              selectedCharacter === char.id && styles.characterCardSelected,
            ]}
            onPress={() => {
              if (char.id === 'photoPoop') {
                pickCustomImage();
              } else {
                setSelectedCharacter(char.id);
              }
            }}
          >
            <View style={[styles.characterIcon, { backgroundColor: char.color }]}>
              <MaterialCommunityIcons name={char.icon as any} size={36} color="white" />
            </View>
            <Text style={styles.characterName}>{char.name}</Text>
            {char.id === 'photoPoop' && (
              <Text style={styles.uploadHint}>Tap to upload</Text>
            )}
            {selectedCharacter === char.id && (
              <View style={styles.selectedBadge}>
                <Ionicons name="checkmark" size={14} color="white" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom image preview */}
      {customImage && selectedCharacter === 'photoPoop' && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>Your face will become the poop!</Text>
          <Image source={{ uri: customImage }} style={styles.previewImage} />
        </View>
      )}

      <TouchableOpacity style={styles.startButton} onPress={startGame}>
        <Ionicons name="play" size={28} color="white" />
        <Text style={styles.startButtonText}>Start Flying!</Text>
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
      <View style={[styles.background, { backgroundColor: '#87CEEB' }]}>
        {/* Sky gradient effect */}
        <View style={styles.skyTop} />
        <View style={styles.skyBottom} />
      </View>

      {/* Game Canvas */}
      <View
        style={styles.gameContainer}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleFlap}
      >
        <Svg
          style={StyleSheet.absoluteFill}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          viewBox={`0 0 ${GAME_WIDTH} ${GAME_HEIGHT}`}
        >
          {/* Obstacles */}
          {gameState !== 'select' && obstacles.map((obs, i) => renderObstacle(obs, i))}
          
          {/* Character */}
          {gameState !== 'select' && renderCharacter()}
        </Svg>
      </View>

      {/* UI Overlay */}
      {gameState !== 'select' && (
        <View style={styles.uiOverlay}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>

          {/* Score toggle */}
          <TouchableOpacity 
            style={styles.scoreToggle} 
            onPress={() => setShowScore(!showScore)}
          >
            <Ionicons name={showScore ? "eye" : "eye-off"} size={20} color="white" />
          </TouchableOpacity>

          {/* Score display (optional) */}
          {showScore && (
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreText}>Pass: {score}</Text>
            </View>
          )}

          {/* Character button */}
          <TouchableOpacity 
            style={styles.characterButton} 
            onPress={() => setGameState('select')}
          >
            <MaterialCommunityIcons name="account-switch" size={22} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Selection Screen */}
      {gameState === 'select' && renderSelectionScreen()}

      {/* Splat overlay */}
      {gameState === 'splat' && (
        <View style={styles.splatOverlay} pointerEvents="box-none">
          <Text style={styles.splatText}>SPLAT!</Text>
          <Text style={styles.tapToRetry}>Tap anywhere to retry</Text>
        </View>
      )}

      {/* Tap hint during gameplay */}
      {gameState === 'playing' && gameTime < 60 && (
        <View style={styles.tapHint} pointerEvents="none">
          <Text style={styles.tapHintText}>Tap to fly!</Text>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  skyTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#64B5F6',
  },
  skyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: '#90CAF9',
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
  scoreToggle: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 25,
    marginLeft: 10,
  },
  scoreContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginLeft: 10,
  },
  scoreText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  characterButton: {
    backgroundColor: 'rgba(156, 39, 176, 0.7)',
    padding: 12,
    borderRadius: 25,
    marginLeft: 'auto',
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 30, 60, 0.95)',
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
  characterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
    maxWidth: 350,
  },
  characterCard: {
    width: '45%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  characterCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  characterIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  characterName: {
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
    backgroundColor: '#4CAF50',
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
  splatOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 69, 19, 0.6)',
  },
  splatText: {
    color: '#FFE082',
    fontSize: 60,
    fontWeight: 'bold',
    textShadowColor: '#5D4037',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 5,
  },
  tapToRetry: {
    color: 'white',
    fontSize: 18,
    marginTop: 20,
  },
  tapHint: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tapHintText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});
