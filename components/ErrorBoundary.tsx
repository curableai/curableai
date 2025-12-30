import { Ionicons } from '@expo/vector-icons';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Global Error Boundary to catch render-time crashes.
 * In a production app, this should also log to Sentry.
 */
export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        // TODO: Add Sentry.captureException(error) here
    }

    private handleRestart = () => {
        this.setState({ hasError: false, error: null });
        // In some cases you might want to force a reload, but resetting state often works
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <SafeAreaView style={styles.container}>
                    <View style={styles.content}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="alert-circle" size={64} color="#FF453A" />
                        </View>
                        <Text style={styles.title}>Something went wrong</Text>
                        <Text style={styles.message}>
                            We've encountered an unexpected clinical error. Your data is safe, but we need to restart this section.
                        </Text>

                        {__DEV__ && (
                            <ScrollView style={styles.errorScroll}>
                                <Text style={styles.errorText}>{this.state.error?.toString()}</Text>
                            </ScrollView>
                        )}

                        <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
                            <Text style={styles.buttonText}>Return to Dashboard</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
    },
    iconContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#FFF',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    errorScroll: {
        maxHeight: 200,
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        padding: 12,
        marginBottom: 32,
        width: '100%',
    },
    errorText: {
        color: '#FF453A',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        fontSize: 12,
    },
    button: {
        backgroundColor: '#FF6B00',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 16,
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
