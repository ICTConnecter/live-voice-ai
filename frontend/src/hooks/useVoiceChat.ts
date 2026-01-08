import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "./useAudio";

export interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

interface UseVoiceChatOptions {
  wsUrl?: string;
  // Time in ms to wait before finalizing a transcript
  transcriptDebounceMs?: number;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface TranscriptBuffer {
  text: string;
  sender: "user" | "assistant";
  timeoutId: ReturnType<typeof setTimeout> | null;
}

export function useVoiceChat(options: UseVoiceChatOptions = {}) {
  const { wsUrl = "ws://localhost:8080/ws/voice", transcriptDebounceMs = 500 } =
    options;

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Buffers for accumulating transcript fragments
  const userBufferRef = useRef<TranscriptBuffer>({
    text: "",
    sender: "user",
    timeoutId: null,
  });
  const assistantBufferRef = useRef<TranscriptBuffer>({
    text: "",
    sender: "assistant",
    timeoutId: null,
  });

  /**
   * Finalize a transcript buffer and add it as a message
   */
  const finalizeBuffer = useCallback(
    (buffer: React.MutableRefObject<TranscriptBuffer>) => {
      if (buffer.current.text.trim()) {
        const newMessage: Message = {
          id: crypto.randomUUID(),
          text: buffer.current.text.trim(),
          sender: buffer.current.sender,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, newMessage]);
      }
      // Reset buffer
      buffer.current.text = "";
      if (buffer.current.timeoutId) {
        clearTimeout(buffer.current.timeoutId);
        buffer.current.timeoutId = null;
      }
    },
    []
  );

  /**
   * Add text to a transcript buffer with debounced finalization
   */
  const appendToBuffer = useCallback(
    (
      buffer: React.MutableRefObject<TranscriptBuffer>,
      text: string,
      debounceMs: number
    ) => {
      // Append text
      buffer.current.text += text;

      // Clear existing timeout
      if (buffer.current.timeoutId) {
        clearTimeout(buffer.current.timeoutId);
      }

      // Set new timeout to finalize
      buffer.current.timeoutId = setTimeout(() => {
        finalizeBuffer(buffer);
      }, debounceMs);
    },
    [finalizeBuffer]
  );

  // Audio handling
  const handleAudioData = useCallback((base64Audio: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          delta: base64Audio,
        })
      );
    }
  }, []);

  const {
    isRecording,
    isPlaying,
    startRecording,
    stopRecording,
    queueAudio,
    clearAudioQueue,
    cleanup: cleanupAudio,
  } = useAudio({
    onAudioData: handleAudioData,
  });

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus("connecting");
    setError(null);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const messageType = data.type;

        switch (messageType) {
          case "session.ready":
            setConnectionStatus("connected");
            break;

          case "transcript":
            // Accumulate transcript fragments
            if (data.sender === "user") {
              appendToBuffer(userBufferRef, data.text, transcriptDebounceMs);
            } else if (data.sender === "assistant") {
              appendToBuffer(
                assistantBufferRef,
                data.text,
                transcriptDebounceMs
              );
            }
            break;

          case "response.audio.delta":
            queueAudio(data.delta);
            break;

          case "audio.done":
            // Audio playback complete - finalize assistant buffer immediately
            finalizeBuffer(assistantBufferRef);
            break;

          case "session.reset.done":
            setMessages([]);
            clearAudioQueue();
            // Clear buffers
            userBufferRef.current.text = "";
            assistantBufferRef.current.text = "";
            if (userBufferRef.current.timeoutId) {
              clearTimeout(userBufferRef.current.timeoutId);
              userBufferRef.current.timeoutId = null;
            }
            if (assistantBufferRef.current.timeoutId) {
              clearTimeout(assistantBufferRef.current.timeoutId);
              assistantBufferRef.current.timeoutId = null;
            }
            break;

          case "error":
            setError(data.message);
            setConnectionStatus("error");
            break;

          default:
            console.log("Unknown message type:", messageType);
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("WebSocket connection error");
      setConnectionStatus("error");
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setConnectionStatus("disconnected");
    };

    wsRef.current = ws;
  }, [
    wsUrl,
    queueAudio,
    clearAudioQueue,
    appendToBuffer,
    finalizeBuffer,
    transcriptDebounceMs,
  ]);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopRecording();
    cleanupAudio();
    setConnectionStatus("disconnected");
    // Clear any pending buffers
    if (userBufferRef.current.timeoutId) {
      clearTimeout(userBufferRef.current.timeoutId);
    }
    if (assistantBufferRef.current.timeoutId) {
      clearTimeout(assistantBufferRef.current.timeoutId);
    }
  }, [stopRecording, cleanupAudio]);

  /**
   * Toggle recording on/off
   */
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      // Finalize user buffer when stopping recording
      finalizeBuffer(userBufferRef);
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, finalizeBuffer]);

  /**
   * Reset conversation
   */
  const resetConversation = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "session.reset",
        })
      );
    }
    clearAudioQueue();
  }, [clearAudioQueue]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionStatus,
    isRecording,
    isPlaying,
    messages,
    error,
    connect,
    disconnect,
    toggleRecording,
    resetConversation,
  };
}
