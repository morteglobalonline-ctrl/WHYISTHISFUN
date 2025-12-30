import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  ScrollView,
  Image,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Import game icons
const GameIcons = {
  dumpit: require('../assets/icons/icon_dumpit.png'),
  crazyhead: require('../assets/icons/icon_crazyhead.png'),
  toiletchaos: require('../assets/icons/icon_toiletchaos.png'),
  flushit: require('../assets/icons/icon_flushit.png'),
  deadeye: require('../assets/icons/icon_deadeye.png'),
};

// Import header logo
const HeaderLogo = require('../assets/header_logo.png');

// Import game components
import DumpItGame from './dumpit';
import CrazyHeadGame from './crazyhead';
import ToiletChaosGame from './toiletchaos';
import FlushItGame from './flushit';
import DeadeyeGame from './deadeye';

type GameScreen = 'menu' | 'dumpit' | 'crazyhead' | 'toiletchaos' | 'flushit' | 'deadeye';

export default function MainMenu() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('menu');
  
  // Subtle pulse animation for hero header
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    // Create a gentle breathing/pulse animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    
    return () => pulse.stop();
  }, [pulseAnim]);

  // Render the selected game
  if (currentScreen === 'dumpit') {
    return <DumpItGame onBack={() => setCurrentScreen('menu')} />;
  }

  if (currentScreen === 'crazyhead') {
    return <CrazyHeadGame onBack={() => setCurrentScreen('menu')} />;
  }

  if (currentScreen === 'toiletchaos') {
    return <ToiletChaosGame onBack={() => setCurrentScreen('menu')} />;
  }

  if (currentScreen === 'flushit') {
    return <FlushItGame onBack={() => setCurrentScreen('menu')} />;
  }

  if (currentScreen === 'deadeye') {
    return <DeadeyeGame onBack={() => setCurrentScreen('menu')} />;
  }

  // Main Menu
  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Pure White Background */}
      <View style={styles.background} />

      {/* Content */}
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.content}>
        {/* Hero Header Logo */}
        <View style={styles.heroContainer}>
          <Animated.Image
            source={HeaderLogo}
            style={[
              styles.heroLogo,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
            resizeMode="contain"
          />
        </View>

        {/* Game Cards */}
        <View style={styles.gamesContainer}>
          {/* Dump It Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('dumpit')}
            activeOpacity={0.85}
          >
            <View style={styles.gameCardIconContainer}>
              <Image source={GameIcons.dumpit} style={styles.gameCardIcon} />
            </View>
            <View style={styles.gameCardContent}>
              <Text style={styles.gameCardTitle}>Dump It</Text>
              <Text style={styles.gameCardDescription}>
                Catch with pan, aim, and toss waste into the bin!
              </Text>
              <View style={styles.gameCardTags}>
                <View style={[styles.tag, { backgroundColor: 'rgba(76, 175, 80, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#4CAF50' }]}>Physics</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: 'rgba(33, 150, 243, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#2196F3' }]}>Skill</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={28} color="rgba(0,0,0,0.25)" />
          </TouchableOpacity>

          {/* Crazy Head Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('crazyhead')}
            activeOpacity={0.85}
          >
            <View style={styles.gameCardIconContainer}>
              <Image source={GameIcons.crazyhead} style={styles.gameCardIcon} />
            </View>
            <View style={styles.gameCardContent}>
              <Text style={styles.gameCardTitle}>Crazy Head</Text>
              <Text style={styles.gameCardDescription}>
                Throw objects at the head - only headshots count!
              </Text>
              <View style={styles.gameCardTags}>
                <View style={[styles.tag, { backgroundColor: 'rgba(255, 87, 34, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#FF5722' }]}>Penalty</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: 'rgba(156, 39, 176, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#9C27B0' }]}>Custom</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={28} color="rgba(0,0,0,0.25)" />
          </TouchableOpacity>

          {/* Toilet Chaos Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('toiletchaos')}
            activeOpacity={0.85}
          >
            <View style={styles.gameCardIconContainer}>
              <Image source={GameIcons.toiletchaos} style={styles.gameCardIcon} />
            </View>
            <View style={styles.gameCardContent}>
              <Text style={styles.gameCardTitle}>Toilet Chaos</Text>
              <Text style={styles.gameCardDescription}>
                Flappy fun through poop streams - stress-free chaos!
              </Text>
              <View style={styles.gameCardTags}>
                <View style={[styles.tag, { backgroundColor: 'rgba(93, 64, 55, 0.3)' }]}>
                  <Text style={[styles.tagText, { color: '#8D6E63' }]}>Flappy</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: 'rgba(33, 150, 243, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#2196F3' }]}>Zen</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={28} color="rgba(0,0,0,0.25)" />
          </TouchableOpacity>

          {/* Flush It Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('flushit')}
            activeOpacity={0.85}
          >
            <View style={styles.gameCardIconContainer}>
              <Image source={GameIcons.flushit} style={styles.gameCardIcon} />
            </View>
            <View style={styles.gameCardContent}>
              <Text style={styles.gameCardTitle}>Flush It</Text>
              <Text style={styles.gameCardDescription}>
                Clean the bowl with satisfying liquid streams!
              </Text>
              <View style={styles.gameCardTags}>
                <View style={[styles.tag, { backgroundColor: 'rgba(33, 150, 243, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#2196F3' }]}>ASMR</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: 'rgba(76, 175, 80, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#4CAF50' }]}>Satisfying</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={28} color="rgba(0,0,0,0.25)" />
          </TouchableOpacity>

          {/* Deadeye Fun Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('deadeye')}
            activeOpacity={0.85}
          >
            <View style={styles.gameCardIconContainer}>
              <Image source={GameIcons.deadeye} style={styles.gameCardIcon} />
            </View>
            <View style={styles.gameCardContent}>
              <Text style={styles.gameCardTitle}>Deadeye Fun</Text>
              <Text style={styles.gameCardDescription}>
                Sniper-style target shooting - calm & precise!
              </Text>
              <View style={styles.gameCardTags}>
                <View style={[styles.tag, { backgroundColor: 'rgba(229, 57, 53, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#E53935' }]}>Aim</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: 'rgba(156, 39, 176, 0.2)' }]}>
                  <Text style={[styles.tagText, { color: '#9C27B0' }]}>Custom</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={28} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>More games coming soon!</Text>
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  decorContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.1,
  },
  decorCircle1: {
    width: 300,
    height: 300,
    backgroundColor: '#4CAF50',
    top: -100,
    right: -100,
  },
  decorCircle2: {
    width: 200,
    height: 200,
    backgroundColor: '#FF5722',
    bottom: 100,
    left: -80,
  },
  decorCircle3: {
    width: 150,
    height: 150,
    backgroundColor: '#2196F3',
    top: '40%',
    right: -50,
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroLogo: {
    width: '100%',
    height: 200,
  },
  gamesContainer: {
    flex: 1,
    gap: 20,
  },
  gameCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  gameCardIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    overflow: 'hidden',
  },
  gameCardIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
  },
  gameCardContent: {
    flex: 1,
    marginLeft: 16,
  },
  gameCardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 6,
  },
  gameCardDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
    marginBottom: 10,
  },
  gameCardTags: {
    flexDirection: 'row',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  footerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
});
