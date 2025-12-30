import { aiPromptService, HealthPrompt } from '@/lib/AIPromptService';
import { chatSessionService } from '@/lib/chatSessionService';
import { interpretClinicalDocument } from '@/lib/openAIHealthService';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  shouldAnimate?: boolean;
  imageUri?: string; // For displaying uploaded images in chat
}

import { TypewriterMessage } from '@/components/TypewriterMessage';


export default function AIHealthAssistant() {
  const { colors } = useTheme();
  // ... existing hooks
  const { sessionId: paramSessionId } = useLocalSearchParams<{ sessionId: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [proactivePrompts, setProactivePrompts] = useState<HealthPrompt[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSendingMessage(false);
      // Add a system message indicating stop
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: '*(Response stopped by user)*',
        created_at: new Date().toISOString(),
        shouldAnimate: false
      }]);
    }
  };

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardVisible(true);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  useEffect(() => {
    if (paramSessionId) {
      // If a session ID is provided via params, load it prioritized
      setupWithSession(paramSessionId);
    } else {
      initializeAssistant();
    }
  }, [paramSessionId]);

  const setupWithSession = async (sid: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const userSessions = await chatSessionService.getUserSessions(user.id);
      setSessions(userSessions);
      await loadSession(sid);
    }
  };

  useEffect(() => {
    if (chatMessages.length > 0) {
      // Small timeout to allow layout to settle before scrolling
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatMessages]);

  const initializeAssistant = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const userSessions = await chatSessionService.getUserSessions(user.id);
        setSessions(userSessions);

        if (userSessions.length > 0) {
          // If there's a history, load the most recent session
          await loadSession(userSessions[0].id);
        } else {
          // NEW PROACTIVE LOGIC: No generic greetings. Load prompt cards.
          fetchProactivePrompts(user.id);
        }
      }
    } catch (error) {
      console.error('Error initializing assistant:', error);
    }
  };

  const fetchProactivePrompts = async (uid: string) => {
    setIsLoadingPrompts(true);
    try {
      const prompts = await aiPromptService.generatePrompts(uid);
      setProactivePrompts(prompts);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPrompts(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const messages = await chatSessionService.getSessionMessages(sessionId);
    // When loading history, we DO NOT animate
    const formattedMessages = messages.map(m => ({ ...m, shouldAnimate: false })) as ChatMessage[];
    setChatMessages(formattedMessages);
    setIsSidebarOpen(false);
  };

  const handleStartNewChat = async () => {
    setChatMessages([]);
    setCurrentSessionId(null);
    setIsSidebarOpen(false);
    // Refresh prompts when starting fresh
    if (userId) fetchProactivePrompts(userId);
  };

  const handleSelectPrompt = async (prompt: HealthPrompt) => {
    setIsSendingMessage(true);
    try {
      // 1. Create session with the trigger text as title
      const sid = await chatSessionService.createSession(userId, prompt.trigger_text);
      setCurrentSessionId(sid);

      // 2. Refresh sessions
      setSessions(await chatSessionService.getUserSessions(userId));

      // 3. Manually insert the first assistant message as per the opening
      // Note: We bypass the normal chat loop for the very first message
      const { data: assistantMsg, error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sid,
          user_id: userId,
          role: 'assistant',
          content: prompt.chat_opening
        })
        .select()
        .single();

      if (error) throw error;

      setChatMessages([{
        id: assistantMsg.id,
        role: 'assistant',
        content: assistantMsg.content,
        created_at: assistantMsg.created_at,
        shouldAnimate: true
      }]);

      setProactivePrompts([]); // Clear prompts once chat starts

    } catch (e) {
      console.error('Error selecting prompt:', e);
      Alert.alert('Error', 'Failed to start investigation.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handlePickImage = async () => {
    Alert.alert(
      'Upload Image',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.8,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setSelectedImage(result.assets[0].uri);
                setSelectedImageBase64(result.assets[0].base64 || null);
              }
            } catch (error) {
              console.error('Error taking photo:', error);
              Alert.alert('Error', 'Failed to take photo');
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setSelectedImage(result.assets[0].uri);
                setSelectedImageBase64(result.assets[0].base64 || null);
              }
            } catch (error) {
              console.error('Error picking image:', error);
              Alert.alert('Error', 'Failed to pick image');
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleSendMessage = async () => {
    if ((!inputMessage.trim() && !selectedImage) || isSendingMessage || !userId) return;

    const messageText = inputMessage.trim();
    const hasImage = !!selectedImage;
    const imageBase64 = selectedImageBase64; // Capture before clearing!

    const tempUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
      shouldAnimate: false,
      imageUri: selectedImage || undefined
    };

    // Clear inputs immediately for UX
    setChatMessages(prev => [...prev, tempUserMsg]);
    setInputMessage('');
    setSelectedImage(null);
    setSelectedImageBase64(null);
    setIsSendingMessage(true);

    try {
      // Case 1: Image Analysis
      if (hasImage && imageBase64) {
        console.log('[Image Analysis] Starting document interpretation...');
        console.log('[Image Analysis] Base64 length:', imageBase64.length);

        let activeSessionId = currentSessionId;

        // Create session if needed
        if (!activeSessionId) {
          activeSessionId = await chatSessionService.createSession(userId, "Clinical Document Analysis");
          setCurrentSessionId(activeSessionId);
          setSessions(await chatSessionService.getUserSessions(userId));
        }

        // Analyze image with OpenAI Vision
        const analysis = await interpretClinicalDocument(userId, imageBase64, "Uploaded Clinical Document");

        console.log('[Image Analysis] Result:', analysis);

        // Construct AI response from analysis
        let aiResponseText: string;
        if (analysis) {
          aiResponseText = `I've analyzed the document.\n\n**Summary:** ${analysis.summary}\n\n**Key Findings:**\n${analysis.keyFindings.map(f => `- ${f}`).join('\n')}\n\n**Recommendations:**\n${analysis.recommendations.map(r => `- ${r}`).join('\n')}\n\n**Urgency Level:** ${analysis.urgency}`;
        } else {
          aiResponseText = "I had trouble analyzing that image. Please ensure it's a clear photo of a clinical document, lab result, or prescription, and try again.";
        }

        // Add AI response to chat (don't send through normal chat service which would invoke AI again)
        const aiMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: aiResponseText,
          created_at: new Date().toISOString(),
          shouldAnimate: true
        };

        setChatMessages(prev => [...prev, aiMessage]);

      } else {
        // Case 2: Normal Text Chat
        const result = await chatSessionService.sendMessage(userId, currentSessionId, messageText);

        if (!currentSessionId) {
          setCurrentSessionId(result.sessionId);
          // Refresh sessions list
          const updatedSessions = await chatSessionService.getUserSessions(userId);
          setSessions(updatedSessions);
        }

        setChatMessages(prev => [...prev, {
          ...(result.assistantMessage as any),
          shouldAnimate: true // Animate the new AI response
        }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={styles.menuButton}>
          <Ionicons name="time-outline" size={24} color={colors.text} />
          <Text style={[styles.historyLabel, { color: colors.textMuted }]}>History</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Curable AI</Text>
        </View>

        <TouchableOpacity onPress={handleStartNewChat} style={styles.newChatButton}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {chatMessages.length === 0 && !isSendingMessage && (
          <View style={styles.emptyState}>
            <View style={styles.emptyHeader}>
              <Ionicons name="sparkles" size={32} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Clinical Observations</Text>
            </View>

            {isLoadingPrompts ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : proactivePrompts.length > 0 ? (
              <View style={styles.promptList}>
                {proactivePrompts.map(prompt => (
                  <TouchableOpacity
                    key={prompt.id}
                    style={[styles.promptCard, { backgroundColor: '#0D0D0D' }]}
                    onPress={() => handleSelectPrompt(prompt)}
                  >
                    <View style={styles.promptTop}>
                      <View style={[styles.promptBadge, { backgroundColor: `${colors.primary}20` }]}>
                        <Text style={[styles.promptBadgeText, { color: colors.primary }]}>
                          {prompt.source.replace('_', ' ')}
                        </Text>
                      </View>
                      {prompt.confidence === 'high' && (
                        <Ionicons name="alert-circle" size={16} color="#FF453A" />
                      )}
                    </View>
                    <Text style={[styles.promptText, { color: colors.text }]}>{prompt.trigger_text}</Text>
                    <View style={styles.promptFooter}>
                      <Text style={[styles.promptAction, { color: colors.textMuted }]}>
                        Tap to discuss
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No data-driven patterns detected yet. Complete your check-ins to unlock proactive insights.
              </Text>
            )}
          </View>
        )}

        {chatMessages.map((msg) => (
          <View key={msg.id} style={[styles.messageRow, msg.role === 'user' ? styles.userRow : styles.aiRow]}>
            <View style={[
              styles.bubble,
              msg.role === 'user' ? [styles.userBubble, { borderColor: colors.primary }] : [styles.aiBubble, { backgroundColor: '#0D0D0D' }],
            ]}>
              {msg.imageUri && (
                <Image
                  source={{ uri: msg.imageUri }}
                  style={styles.msgImage}
                  resizeMode="cover"
                />
              )}
              {msg.content ? (
                <TypewriterMessage
                  style={[styles.messageText, { color: colors.text }]}
                  text={msg.content}
                  shouldAnimate={msg.shouldAnimate}
                />
              ) : null}
            </View>
          </View>
        ))}
        {isSendingMessage && (
          <View style={styles.messageRow}>
            <View style={[styles.bubble, styles.aiBubble, { backgroundColor: '#0D0D0D', flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <TouchableOpacity onPress={handleStopGeneration} style={{ backgroundColor: 'rgba(255,69,58,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                <Text style={{ color: '#FF453A', fontWeight: '600', fontSize: 13 }}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* FIXED: Reduced offset and internal padding for smoother keyboard */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
            <TouchableOpacity onPress={() => { setSelectedImage(null); setSelectedImageBase64(null); }} style={styles.removeImageButton}>
              <Ionicons name="close-circle" size={24} color="#FF453A" />
            </TouchableOpacity>
          </View>
        )}

        <View style={[
          styles.inputContainer,
          {
            borderTopColor: 'rgba(255,255,255,0.05)',
            // Dynamic: When keyboard open = 16, when closed = 100 (clears floating tab bar)
            paddingBottom: isKeyboardVisible ? 16 : 100
          }
        ]}>
          <TouchableOpacity onPress={handlePickImage} style={styles.attachButton}>
            <Ionicons name="camera-outline" size={24} color={colors.primary} />
          </TouchableOpacity>

          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: '#0A0A0A' }]}
            placeholder="Describe symptoms or upload report..."
            placeholderTextColor={colors.textLight}
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            textAlignVertical="center"
          />
          <TouchableOpacity onPress={handleSendMessage} disabled={(!inputMessage.trim() && !selectedImage) || isSendingMessage} style={styles.sendButton}>
            <Ionicons name="arrow-up" size={24} color={(inputMessage.trim() || selectedImage) ? colors.primary : colors.textLight} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Sidebar Modal */}
      <Modal
        visible={isSidebarOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsSidebarOpen(false)}
      >
        <View style={styles.sidebarOverlay}>
          <TouchableOpacity style={styles.sidebarDismiss} onPress={() => setIsSidebarOpen(false)} />
          <Animated.View style={[styles.sidebarContent, { backgroundColor: '#0A0A0A' }]}>
            <View style={styles.sidebarHeader}>
              <Text style={[styles.sidebarTitle, { color: colors.text }]}>Investigation History</Text>
              <TouchableOpacity onPress={() => setIsSidebarOpen(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.sidebarNewChat, { backgroundColor: 'rgba(255,107,0,0.05)' }]} onPress={handleStartNewChat}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={[styles.sidebarNewChatText, { color: colors.primary }]}>New Investigation</Text>
            </TouchableOpacity>

            <ScrollView contentContainerStyle={styles.sidebarList}>
              {sessions.map((session) => (
                <TouchableOpacity
                  key={session.id}
                  style={[styles.sessionItem, session.id === currentSessionId && { backgroundColor: '#121212' }]}
                  onPress={() => loadSession(session.id)}
                >
                  <Ionicons name="chatbox-ellipses-outline" size={18} color={session.id === currentSessionId ? colors.primary : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sessionTitle, { color: colors.text }]} numberOfLines={1}>{session.title}</Text>
                    <Text style={[styles.sessionDate, { color: colors.textMuted }]}>{new Date(session.created_at).toLocaleDateString()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16
  },
  menuButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0D0D0D', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  historyLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  newChatButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#0D0D0D' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5, textTransform: 'uppercase' },
  chatArea: { flex: 1 },
  chatContent: { padding: 24, paddingBottom: 60 },
  messageRow: { marginBottom: 20, flexDirection: 'row' },
  userRow: { justifyContent: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', padding: 16, borderRadius: 24 },
  userBubble: { backgroundColor: '#000000', borderWidth: 1 },
  aiBubble: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  messageText: { fontSize: 16, lineHeight: 24 },
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 16, // This is static here because we handle the dynamic part inline in the render method now
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
  },
  attachButton: { padding: 8 },
  input: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  sendButton: { padding: 8 },
  imagePreviewContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  removeImageButton: {
    marginLeft: -10,
    marginTop: -10,
    backgroundColor: 'white',
    borderRadius: 12
  },
  emptyState: { flex: 1, marginTop: 60, paddingHorizontal: 8 },
  emptyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24, paddingLeft: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyText: { fontSize: 15, fontWeight: '500', textAlign: 'center', marginTop: 40 },
  promptList: { gap: 12 },
  promptCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3
  },
  promptTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  promptBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  promptBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  promptText: { fontSize: 17, fontWeight: '600', lineHeight: 24, marginBottom: 16 },
  promptFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  promptAction: { fontSize: 12, fontWeight: '600' },

  // Sidebar Styles
  sidebarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', flexDirection: 'row' },
  sidebarDismiss: { flex: 1 },
  sidebarContent: { width: width * 0.8, height: '100%', padding: 24, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)' },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, marginTop: 40 },
  sidebarTitle: { fontSize: 20, fontWeight: '800' },
  sidebarNewChat: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, gap: 12, marginBottom: 24 },
  sidebarNewChatText: { fontWeight: '700', fontSize: 15 },
  sidebarList: { gap: 8 },
  sessionItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, gap: 12 },
  sessionTitle: { fontSize: 15, fontWeight: '600' },
  sessionDate: { fontSize: 12, marginTop: 2 }
});
