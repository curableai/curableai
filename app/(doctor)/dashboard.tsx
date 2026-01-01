import { useTheme } from '@/lib/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function DoctorDashboard() {
    const { colors } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Text style={[styles.title, { color: colors.text }]}>Doctor Dashboard</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Coming soon...
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
    },
});
