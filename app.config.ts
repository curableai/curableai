import 'dotenv/config';
import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: 'curable-mobile',
    slug: 'curable-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'curablemobile',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.curable.mobile',
        infoPlist: {
            NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: false,
                NSExceptionDomains: {
                    'supabase.co': {
                        NSExceptionAllowsInsecureHTTPLoads: false,
                        NSIncludesSubdomains: true,
                        NSExceptionRequiresForwardSecrecy: true,
                    },
                    'api.openai.com': {
                        NSExceptionAllowsInsecureHTTPLoads: false,
                        NSIncludesSubdomains: true,
                        NSExceptionRequiresForwardSecrecy: true,
                    }
                },
            },
            NSHealthShareUsageDescription: 'Curable needs access to your health data to provide personalized health insights, track your wellness journey, and predict potential health risks early.',
            NSHealthUpdateUsageDescription: 'Curable needs permission to update your health data for accurate tracking and analysis.',
            UIBackgroundModes: ['fetch', 'processing'],
        },
        entitlements: {
            'com.apple.developer.healthkit': true,
            'com.apple.developer.healthkit.access': [
                'health-records.read',
                'health-records.write',
            ],
        },
    },
    android: {
        adaptiveIcon: {
            backgroundColor: '#E6F4FE',
            foregroundImage: './assets/images/android-icon-foreground.png',
            backgroundImage: './assets/images/android-icon-background.png',
            monochromeImage: './assets/images/android-icon-monochrome.png',
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        permissions: [
            'android.permission.INTERNET',
            'android.permission.ACCESS_NETWORK_STATE',
            'android.permission.ACTIVITY_RECOGNITION',
        ],
        package: 'com.curable.mobile',
    },
    web: {
        output: 'static',
        favicon: './assets/images/favicon.png',
        bundler: 'metro',
    },
    plugins: [
        'expo-router',
        [
            'expo-splash-screen',
            {
                image: './assets/images/splash-icon.png',
                imageWidth: 200,
                resizeMode: 'contain',
                backgroundColor: '#ffffff',
                dark: {
                    backgroundColor: '#000000',
                },
            },
        ],
        [
            'react-native-health',
            {
                isClinicalDataEnabled: false,
                healthSharePermission: 'Curable needs access to your health data to provide personalized health insights and track your wellness journey.',
                healthUpdatePermission: 'Curable needs permission to update your health data for accurate tracking and analysis.',
            },
        ],
        [
            'react-native-health-connect',
            {
                rationaleActivityRecognition: 'We need to recognize your activity to track your workouts.',
                permissions: [
                    { accessType: 'read', recordType: 'Steps' },
                    { accessType: 'read', recordType: 'HeartRate' },
                    { accessType: 'read', recordType: 'TotalCaloriesBurned' },
                    { accessType: 'read', recordType: 'SleepSession' },
                ],
            },
        ],
        [
            'expo-build-properties',
            {
                ios: {
                    useFrameworks: 'static',
                },
            },
        ],
        'expo-secure-store',
    ],
    experiments: {
        typedRoutes: true,
        reactCompiler: true,
    },
    extra: {
        router: {
            origin: false,
        },
        eas: {
            projectId: 'your-project-id-here',
        },
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
        openAIApiKey: process.env.OPENAI_API_KEY,
    },
    runtimeVersion: {
        policy: 'sdkVersion',
    },
});
