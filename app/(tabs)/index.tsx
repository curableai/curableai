import { chatSessionService } from '@/lib/chatSessionService';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/lib/theme';
import { getUnifiedHealthData, HealthMetric } from '@/lib/unifiedHealthService';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface VitalCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit: string;
  source?: 'watch' | 'checkin' | 'manual';
}

const VitalCard: React.FC<VitalCardProps> = ({ icon, label, value, unit, source }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.vitalCard, { borderColor: colors.border }]}>
      <View style={[styles.vitalHeader, { justifyContent: 'center' }]}>
        <Ionicons name={icon} size={14} color={colors.primary} />
        <Text style={[styles.vitalLabel, { color: colors.textMuted, textAlign: 'center' }]}>{label}</Text>
      </View>
      <View style={styles.vitalValueContainer}>
        <Text style={[styles.vitalValue, { color: colors.text }]}>{value}</Text>
        <Text style={[styles.vitalUnit, { color: colors.textMuted }]}>{unit}</Text>
      </View>
      {source && (
        <Text style={[styles.sourceTag, { color: colors.textMuted }]}>
          {source === 'watch' ? '⌚ Watch' : source === 'checkin' ? '📋 Check-in' : '✏️ Manual'}
        </Text>
      )}
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [userName, setUserName] = useState<string>('there');
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [isWatchConnected, setIsWatchConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get user name
        const { data: onboarding } = await supabase
          .from('onboarding')
          .select('full_name')
          .eq('user_id', user.id)
          .single();

        if (onboarding?.full_name) {
          setUserName(onboarding.full_name.split(' ')[0]);
        }

        // Get recent chat sessions
        const sessions = await chatSessionService.getUserSessions(user.id);
        setRecentSessions(sessions.slice(0, 3));

        // Get real health data
        await loadHealthData(user.id);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHealthData = async (userId: string) => {
    try {
      const healthData = await getUnifiedHealthData(userId);
      setHealthMetrics(healthData.metrics);
      setIsWatchConnected(healthData.isWatchConnected);
      setLastSyncTime(healthData.lastSyncTime);
    } catch (error) {
      console.error('Error loading health data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserData();
    setRefreshing(false);
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >

        {/* Header Section */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: colors.text }]}>
            Good {getTimeOfDay()}, {userName}
          </Text>
          <Text style={[styles.subtext, { color: colors.textMuted }]}>
            {lastSyncTime
              ? `Last sync: ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Pull down to refresh'}
          </Text>
        </View>

        {/* Vitals Grid - Only show if we have metrics */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading health data...</Text>
          </View>
        ) : healthMetrics.length > 0 ? (
          <View style={styles.vitalsGrid}>
            {healthMetrics.map((metric) => (
              <VitalCard
                key={metric.id}
                icon={metric.icon as any}
                label={metric.label}
                value={String(metric.value)}
                unit={metric.unit}
                source={metric.source}
              />
            ))}
          </View>
        ) : (
          /* No Data - Connect Watch Prompt */
          <TouchableOpacity
            style={[styles.connectPrompt, { backgroundColor: '#0D0D0D', borderColor: colors.primary }]}
            onPress={() => router.push('/connect-device')}
          >
            <Ionicons name="watch-outline" size={48} color={colors.primary} />
            <Text style={[styles.connectTitle, { color: colors.text }]}>Connect Your Watch</Text>
            <Text style={[styles.connectSubtext, { color: colors.textMuted }]}>
              Link your smartwatch to see real-time health metrics like heart rate, steps, SpO2, and more.
            </Text>
            <View style={[styles.connectButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.connectButtonText}>Connect Device</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        )}

        {/* Summary Section - Only show if we have data */}
        {healthMetrics.length > 0 && (
          <View style={styles.summarySection}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Today&apos;s Status</Text>
            <View style={[styles.summaryCard, { backgroundColor: '#0D0D0D' }]}>
              <Text style={[styles.summaryText, { color: colors.text }]}>
                {isWatchConnected
                  ? `Tracking ${healthMetrics.length} health metrics from your connected device.`
                  : 'Complete your daily check-in to log more health data.'}
              </Text>
            </View>
          </View>
        )}

        {/* Recent AI Activity */}
        <View style={styles.historySection}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Pinned Investigations</Text>

          {recentSessions.length > 0 ? (
            <View style={{ gap: 12 }}>
              {recentSessions.map((session) => (
                <TouchableOpacity
                  key={session.id}
                  style={[styles.historyCard, { backgroundColor: '#0D0D0D' }]}
                  onPress={() => router.push({ pathname: '/ai-assistant', params: { sessionId: session.id } })}
                >
                  <View style={styles.historyIcon}>
                    <Ionicons name="analytics" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyText, { color: colors.text }]} numberOfLines={1}>{session.title}</Text>
                    <Text style={[styles.historySubtext, { color: colors.textMuted }]}>
                      {new Date(session.updated_at).toLocaleDateString()} • {session.message_count} messages
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => router.push('/ai-assistant')}
              style={[styles.historyCard, { backgroundColor: '#0D0D0D' }]}
            >
              <View style={styles.historyIcon}>
                <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyText, { color: colors.text }]}>Start Clinical Investigation</Text>
                <Text style={[styles.historySubtext, { color: colors.textMuted }]}>Talk to Curable AI about your health status</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 100, // Space for the tab bar
  },
  header: {
    marginBottom: 40,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 15,
    fontWeight: '400',
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  vitalCard: {
    width: '47%',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    aspectRatio: 1,
    justifyContent: 'space-between',
  },
  vitalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vitalLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  vitalValueContainer: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    width: '100%',
  },
  vitalValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  vitalUnit: {
    fontSize: 14,
    fontWeight: '400',
  },
  summarySection: {
    marginTop: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  historySection: {
    marginTop: 32,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  historyText: {
    fontSize: 15,
    fontWeight: '700'
  },
  historySubtext: {
    fontSize: 12,
    marginTop: 2
  },
  sourceTag: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  connectPrompt: {
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    gap: 16,
  },
  connectTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  connectSubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});