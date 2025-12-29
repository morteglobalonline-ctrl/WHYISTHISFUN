import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Import game components
import DumpItGame from './dumpit';
import CrazyHeadGame from './crazyhead';
import ToiletChaosGame from './toiletchaos';
import FlushItGame from './flushit';

type GameScreen = 'menu' | 'dumpit' | 'crazyhead' | 'toiletchaos' | 'flushit';

export default function MainMenu() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('menu');

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

  // Main Menu
  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Background gradient */}
      <View style={styles.backgroundGradient}>
        <View style={[styles.gradientLayer, { backgroundColor: '#1a1a2e' }]} />
        <View style={[styles.gradientOverlay, { backgroundColor: 'rgba(76, 175, 80, 0.1)' }]} />
      </View>

      {/* Animated decorative elements */}
      <View style={styles.decorContainer}>
        <View style={[styles.decorCircle, styles.decorCircle1]} />
        <View style={[styles.decorCircle, styles.decorCircle2]} />
        <View style={[styles.decorCircle, styles.decorCircle3]} />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.content}>
        {/* Title */}
        <View style={styles.titleContainer}>
          <MaterialCommunityIcons name="gamepad-variant" size={60} color="#4CAF50" />
          <Text style={styles.title}>Mini Games</Text>
          <Text style={styles.subtitle}>Choose your challenge!</Text>
        </View>

        {/* Game Cards */}
        <View style={styles.gamesContainer}>
          {/* Dump It Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('dumpit')}
            activeOpacity={0.85}
          >
            <View style={[styles.gameCardIcon, { backgroundColor: '#4CAF50' }]}>
              <MaterialCommunityIcons name="delete" size={48} color="white" />
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
            <Ionicons name="chevron-forward" size={28} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          {/* Crazy Head Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('crazyhead')}
            activeOpacity={0.85}
          >
            <View style={[styles.gameCardIcon, { backgroundColor: '#FF5722' }]}>
              <MaterialCommunityIcons name="emoticon-cool" size={48} color="white" />
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
            <Ionicons name="chevron-forward" size={28} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          {/* Toilet Chaos Game Card */}
          <TouchableOpacity
            style={styles.gameCard}
            onPress={() => setCurrentScreen('toiletchaos')}
            activeOpacity={0.85}
          >
            <View style={[styles.gameCardIcon, { backgroundColor: '#5D4037' }]}>
              <MaterialCommunityIcons name="toilet" size={48} color="white" />
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
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 38,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
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
  gameCardIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
