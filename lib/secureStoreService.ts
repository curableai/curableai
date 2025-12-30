import * as SecureStore from 'expo-secure-store';

/**
 * Service to handle sensitive data that should be encrypted at rest.
 * Replaces AsyncStorage for items like auth tokens, health flags, or user identifiers.
 */
const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9.\-_]/g, '_');

export const secureStoreService = {
    /**
     * Store a value securely
     */
    async save(key: string, value: string): Promise<void> {
        try {
            await SecureStore.setItemAsync(sanitizeKey(key), value);
        } catch (error) {
            console.error(`Error saving to SecureStore [${key}]:`, error);
        }
    },

    /**
     * Retrieve a value securely
     */
    async get(key: string): Promise<string | null> {
        try {
            return await SecureStore.getItemAsync(sanitizeKey(key));
        } catch (error) {
            console.error(`Error getting from SecureStore [${key}]:`, error);
            return null;
        }
    },

    /**
     * Delete a value securely
     */
    async delete(key: string): Promise<void> {
        try {
            await SecureStore.deleteItemAsync(sanitizeKey(key));
        } catch (error) {
            console.error(`Error deleting from SecureStore [${key}]:`, error);
        }
    },

    /**
     * Keys constant to prevent typos
     */
    KEYS: {
        AUTH_TOKEN: 'curable_auth_token',
        USER_ID: 'curable_user_id',
        HEALTH_CONSENT: 'curable_health_consent',
        LAST_SYNC_TIMESTAMP: 'curable_last_sync'
    }
};
