import * as Device from 'expo-device';
import { Button, NativeModules, Platform, StyleSheet, DeviceEventEmitter, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef } from 'react';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const { SpyMeNativeModule } = NativeModules;
  const [logs, setLogs] = useState<string[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const subscription = DeviceEventEmitter.addListener('SpyMeLogEvent', (message: string) => {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
      });

      return () => {
        subscription.remove();
      };
    }
  }, []);

  const handleStartUplink = () => {
    if (Platform.OS === 'android') {
      SpyMeNativeModule?.startService();
    } else {
      console.warn("SpyMe Foreground Service is Android only.");
    }
  };

  const handleStopUplink = () => {
    if (Platform.OS === 'android') {
      SpyMeNativeModule?.stopService();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            SpyMe Uplink
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <Button title="Start Foreground Service" color="#10b981" onPress={handleStartUplink} />
          <Button title="Stop Foreground Service" color="#ef4444" onPress={handleStopUplink} />
        </ThemedView>

        <ThemedText type="code" style={styles.code}>
          Service Logs
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.logsContainer}>
          <ScrollView
            ref={scrollViewRef}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            style={styles.scrollView}
          >
            {logs.length === 0 ? (
              <ThemedText style={styles.logText}>Waiting for logs...</ThemedText>
            ) : (
              logs.map((log, index) => (
                <ThemedText key={index} style={styles.logText}>{log}</ThemedText>
              ))
            )}
          </ScrollView>
        </ThemedView>

      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      flexDirection: 'row',
    },
    safeArea: {
      flex: 1,
      paddingHorizontal: Spacing.four,
      alignItems: 'center',
      gap: Spacing.three,
      paddingBottom: BottomTabInset + Spacing.three,
      maxWidth: MaxContentWidth,
    },
    heroSection: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.four,
      gap: Spacing.four,
    },
    title: {
      textAlign: 'center',
    },
    code: {
      textTransform: 'uppercase',
      alignSelf: 'flex-start',
      marginTop: Spacing.four,
    },
    stepContainer: {
      gap: Spacing.three,
      alignSelf: 'stretch',
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.four,
      borderRadius: Spacing.four,
    },
    logsContainer: {
      flex: 1,
      alignSelf: 'stretch',
      padding: Spacing.three,
      borderRadius: Spacing.four,
      backgroundColor: '#000',
    },
    scrollView: {
      flex: 1,
    },
    logText: {
      fontSize: 12,
      fontFamily: 'monospace',
      color: '#00ff00',
      marginBottom: 4,
    }
  });
