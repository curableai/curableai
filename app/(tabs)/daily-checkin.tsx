import OptionChips from '@/components/checkin/OptionChips';
import {
    calculateLifestyleScore,
    CheckinAnswers,
    DAILY_CHECKIN_QUESTIONS,
    generateLifestyleMessage
} from '@/lib/checkinQuestions';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/lib/theme';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DailyCheckinScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    const [answers, setAnswers] = useState<CheckinAnswers>({});
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [saving, setSaving] = useState(false);

    // Lock states
    const [isLoading, setIsLoading] = useState(true);
    const [isLocked, setIsLocked] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [availableTime, setAvailableTime] = useState("6:00 PM");

    const questions = DAILY_CHECKIN_QUESTIONS;
    const currentQuestion = questions[currentQuestionIndex];
    const isFirstQuestion = currentQuestionIndex === 0;
    const isLastQuestion = currentQuestionIndex === questions.length - 1;

    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    // Check status check on mount
    useEffect(() => {
        checkStatusAndSchedule();

        // Setup notifications handler
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
    }, []);

    const checkStatusAndSchedule = async () => {
        try {
            setIsLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // 1. Check if already completed today
                const today = new Date().toISOString().split('T')[0];

                // Check if check-in exists for today in daily_checkins table
                const { data: checkin } = await supabase
                    .from('daily_checkins')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('checkin_date', today)
                    .maybeSingle();

                if (checkin) {
                    setIsCompleted(true);
                    setIsLoading(false);
                    return;
                }
            }

            // 2. Check time (Must be after 6 PM / 18:00)
            const currentHour = new Date().getHours();
            const UNLOCK_HOUR = 18; // 6 PM

            if (currentHour < UNLOCK_HOUR) {
                setIsLocked(true);
            }

            // 3. Schedule Notification for 8 PM
            scheduleDailyReminder();

        } catch (error) {
            console.error('Error checking status:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const scheduleDailyReminder = async () => {
        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            finalStatus = newStatus;
        }

        if (finalStatus === 'granted') {
            // Cancel existing to avoid dupes
            await Notifications.cancelAllScheduledNotificationsAsync();

            await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Time to check in! 🌙",
                    body: "How did your day go? Log your lifestyle stats now.",
                },
                trigger: {
                    hour: 20, // 8 PM
                    minute: 0,
                    type: Notifications.SchedulableTriggerInputTypes.DAILY
                },
            });
        }
    };

    // ... [Helper functions getPillarIcon, etc.] ...

    const getPillarIcon = (pillar: string) => {
        switch (pillar) {
            case 'diet': return '🍎';
            case 'activity': return '🏃';
            case 'sleep': return '💤';
            case 'stress': return '🧘';
            default: return '💚';
        }
    };

    const getPillarName = (pillar: string) => {
        switch (pillar) {
            case 'diet': return 'Diet & Nutrition';
            case 'activity': return 'Physical Activity';
            case 'sleep': return 'Sleep Quality';
            case 'stress': return 'Stress Management';
            default: return 'General Health';
        }
    };

    const handleAnswer = (value: any) => {
        const newAnswers = { ...answers, [currentQuestion.id]: value };
        setAnswers(newAnswers);

        setTimeout(() => {
            if (isLastQuestion) {
                handleComplete(newAnswers);
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
            }
        }, 300);
    };

    const goToPreviousQuestion = () => {
        if (!isFirstQuestion) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const handleComplete = async (finalAnswers: CheckinAnswers) => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // 1. Calculate Score & Insights
            const { score, insights } = calculateLifestyleScore(finalAnswers);
            const message = generateLifestyleMessage(finalAnswers);

            // 2. Prepare Record for daily_checkins table
            // We save a single row per day with all data
            const checkinRecord = {
                user_id: user.id,
                checkin_date: new Date().toISOString().split('T')[0],
                lifestyle_score: score,
                mood: finalAnswers.general_wellbeing,
                stress_level: finalAnswers.stress_level,
                sleep_quality: finalAnswers.sleep_quality,
                energy_level: finalAnswers.energy_level,
                answers: finalAnswers, // Full JSON payload
                insights: insights
            };

            const { error } = await supabase
                .from('daily_checkins')
                .upsert(checkinRecord, {
                    onConflict: 'user_id, checkin_date'
                });

            if (error) throw error;

            // 3. Navigate to Complete Screen
            router.replace({
                pathname: '/CheckinCompleteScreen' as any,
                params: {
                    message,
                    score,
                    insights: JSON.stringify(insights)
                }
            });

        } catch (error) {
            console.error('Error completing check-in:', error);
            Alert.alert('Error', 'Failed to save check-in. Please try again.');
            setSaving(false);
        }
    };

    if (isLoading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (isCompleted) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
                <Text style={[styles.questionText, { color: colors.text, textAlign: 'center' }]}>You're all set for today!</Text>
                <Text style={[styles.helpText, { color: colors.textMuted, textAlign: 'center' }]}>
                    Great job checking in. Come back tomorrow evening for your next log.
                </Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24, padding: 16 }}>
                    <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Go Home</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    if (isLocked) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🌙</Text>
                <Text style={[styles.questionText, { color: colors.text, textAlign: 'center' }]}>Check-in opens at 6 PM</Text>
                <Text style={[styles.helpText, { color: colors.textMuted, textAlign: 'center' }]}>
                    Daily lifestyle logs are best done at the end of your day. We'll send you a reminder tonight!
                </Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24, padding: 16 }}>
                    <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Go Home</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    if (saving) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                    Analyzing your lifestyle choices...
                </Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header with Pillar Badge */}
            <View style={styles.header}>
                <View style={[styles.pillarBadge, { backgroundColor: `${colors.primary}15` }]}>
                    <Text style={[styles.pillarName, { color: colors.primary }]}>
                        {getPillarName(currentQuestion.pillar)}
                    </Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { backgroundColor: `${colors.primary}20` }]}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${progress}%`,
                                    backgroundColor: colors.primary
                                }
                            ]}
                        />
                    </View>
                    <Text style={[styles.progressText, { color: colors.textMuted }]}>
                        Question {currentQuestionIndex + 1} of {questions.length}
                    </Text>
                </View>
            </View>

            {/* Main Question */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.questionArea}>
                    <Text style={[styles.questionText, { color: colors.text }]}>
                        {currentQuestion.question}
                    </Text>

                    {currentQuestion.helpText && (
                        <Text style={[styles.helpText, { color: colors.textMuted }]}>
                            {currentQuestion.helpText}
                        </Text>
                    )}

                    <View style={styles.inputArea}>
                        <OptionChips
                            options={currentQuestion.options?.map(o => o.label) || []}
                            selectedValue={
                                currentQuestion.options?.find(
                                    o => o.value === answers[currentQuestion.id]
                                )?.label
                            }
                            onSelect={(label) => {
                                const option = currentQuestion.options?.find(o => o.label === label);
                                if (option) handleAnswer(option.value);
                            }}
                        />
                    </View>
                </View>
            </ScrollView>

            {/* Navigation - must clear floating tab bar (height:64 + bottom:24 + buffer) */}
            <View style={[styles.footer, { paddingBottom: 110 + insets.bottom }]}>
                <TouchableOpacity
                    onPress={goToPreviousQuestion}
                    disabled={isFirstQuestion}
                    style={[styles.navButton, isFirstQuestion && styles.hidden]}
                >
                    <Text style={[styles.navButtonText, { color: colors.textMuted }]}>
                        ← Back
                    </Text>
                </TouchableOpacity>

                <View style={styles.spacer} />

                {/* Show preview of lifestyle score */}
                {Object.keys(answers).length > 3 && (
                    <View style={[styles.scorePreview, { backgroundColor: `${colors.primary}10` }]}>
                        <Text style={[styles.scoreText, { color: colors.primary }]}>
                            Score: {calculateLifestyleScore(answers).score}%
                        </Text>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center'
    },

    header: {
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 16
    },
    pillarBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        marginBottom: 16
    },
    pillarName: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
    },
    progressContainer: {
        gap: 8
    },
    progressBar: {
        height: 4,
        borderRadius: 2,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        borderRadius: 2
    },
    progressText: {
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center'
    },

    scrollContent: {
        flexGrow: 1
    },
    questionArea: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 40,
        minHeight: 400
    },
    questionText: {
        fontSize: 24,
        fontWeight: '700',
        lineHeight: 32,
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 12
    },
    helpText: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        marginBottom: 32,
        opacity: 0.8,
        fontStyle: 'italic'
    },
    inputArea: {
        width: '100%',
        marginTop: 16
    },

    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 32,
        // paddingBottom handled dynamically
        gap: 16
    },
    navButton: {
        paddingVertical: 12,
        paddingHorizontal: 8
    },
    navButtonText: {
        fontSize: 16,
        fontWeight: '600'
    },
    spacer: {
        flex: 1
    },
    scorePreview: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12
    },
    scoreText: {
        fontSize: 14,
        fontWeight: '700'
    },
    hidden: {
        opacity: 0,
        pointerEvents: 'none'
    }
});