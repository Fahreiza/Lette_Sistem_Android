import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, ActivityIndicator, Platform, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationBar } from 'expo-navigation-bar';
import { initDatabase, resetDatabaseFile } from './src/database/db';
import { useSyncStore } from './src/stores/syncStore';
import { desktopSyncService } from './src/services/desktopSyncService';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ToastContainer } from './src/components/common/ToastContainer';

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);

  const prepare = async () => {
    try {
      setInitError(null);
      setIsDbReady(false);
      console.log('[App] Initializing SQLite database and seeders...');
      await initDatabase();
      setIsDbReady(true);

      // Restore saved Desktop Bridge server URL and test connection in background
      const savedUrl = await useSyncStore.getState().initFromStorage();
      if (savedUrl) {
        desktopSyncService.testConnection(savedUrl).catch((err) => {
          console.warn('[App] Auto-connect to saved desktop bridge failed:', err);
        });
      }
    } catch (e: any) {
      console.error('[App] Database init error on first attempt, attempting self-heal:', e);
      // Automatic self-heal attempt: retry once after 500ms
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await initDatabase();
        setIsDbReady(true);
        setInitError(null);
      } catch (retryErr: any) {
        console.error('[App] Database init persistent error:', retryErr);
        setInitError(retryErr?.message || e?.message || 'Gagal menginisialisasi database lokal.');
      }
    }
  };

  const handleManualRepair = () => {
    Alert.alert(
      'Perbaiki & Reset Database',
      'Apakah Anda ingin mereset file database lokal yang rusak? Akun Admin dan data awal akan disiapkan kembali.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Perbaiki',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsRepairing(true);
              await resetDatabaseFile();
              await prepare();
            } catch (err: any) {
              Alert.alert('Gagal Reset', err?.message || 'Gagal mereset database.');
            } finally {
              setIsRepairing(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    // Hide Android bottom system navigation bar
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setHidden(true);
      } catch (e) {
        console.warn('[App] NavigationBar error:', e);
      }
    }

    prepare();
  }, []);

  if (initError) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar style="auto" />
        <View style={[styles.logoBadge, { borderColor: '#FECACA', backgroundColor: '#FEE2E2' }]}>
          <Text style={styles.logoEmoji}>⚠️</Text>
        </View>
        <Text style={styles.errorTitle}>Gagal Memuat Database</Text>
        <Text style={styles.errorDesc}>{initError}</Text>

        <View style={styles.errorActions}>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => prepare()}
            disabled={isRepairing}
          >
            <Text style={styles.retryButtonText}>Coba Lagi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.repairButton}
            onPress={handleManualRepair}
            disabled={isRepairing}
          >
            <Text style={styles.repairButtonText}>
              {isRepairing ? 'Memperbaiki...' : 'Perbaiki & Reset Database'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isDbReady) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar style="auto" />
        <View style={styles.logoBadge}>
          <Text style={styles.logoEmoji}>🍞</Text>
        </View>
        <Text style={styles.loadingTitle}>Lette Kasir</Text>
        <Text style={styles.loadingSubtitle}>Menyiapkan database lokal...</Text>
        <ActivityIndicator size="small" color="#D97706" style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {Platform.OS === 'android' && <NavigationBar hidden={true} />}
      <RootNavigator />
      <ToastContainer />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FDE68A',
  },
  logoEmoji: {
    fontSize: 34,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#92400E',
  },
  loadingSubtitle: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 4,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 8,
  },
  errorDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  errorActions: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
    alignItems: 'center',
  },
  retryButton: {
    width: '100%',
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  repairButton: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
  },
  repairButtonText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 13,
  },
});
