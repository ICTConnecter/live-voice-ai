import { useCallback, useRef, useState } from "react";

// Gemini Live API audio format:
// - Input: 16kHz PCM16 mono
// - Output: 24kHz PCM16 mono
const INPUT_SAMPLE_RATE = 16000;  // For sending to Gemini
const OUTPUT_SAMPLE_RATE = 24000; // For receiving from Gemini
const BUFFER_SIZE = 2;
const MIN_CHUNK_SIZE = 12288;
const FADE_SAMPLES = 384;

/**
 * Convert Float32Array to PCM16 Int16Array
 */
function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Convert PCM16 Int16Array to Float32Array
 */
function pcm16ToFloat32(pcm16: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

/**
 * Resample audio from source rate to target rate
 */
function resample(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (sourceRate === targetRate) {
    return input;
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
    const t = srcIndex - srcIndexFloor;
    output[i] = input[srcIndexFloor] * (1 - t) + input[srcIndexCeil] * t;
  }

  return output;
}

/**
 * Base64 encode Int16Array
 */
function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 decode to Int16Array
 */
function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

interface UseAudioOptions {
  onAudioData?: (base64Audio: string) => void;
}

export function useAudio(options: UseAudioOptions = {}) {
  const { onAudioData } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Recording refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Playback refs
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  /**
   * Start recording audio from microphone
   */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

      scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // Resample to 16kHz for Gemini input
        const resampled = resample(
          inputData,
          audioContext.sampleRate,
          INPUT_SAMPLE_RATE
        );

        // Convert to PCM16 and base64
        const pcm16 = float32ToPcm16(resampled);
        const base64 = int16ToBase64(pcm16);

        onAudioData?.(base64);
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      mediaStreamRef.current = stream;
      scriptProcessorRef.current = scriptProcessor;

      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      throw error;
    }
  }, [onAudioData]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);
  }, []);

  /**
   * Add audio chunk to playback queue
   */
  const queueAudio = useCallback((base64Audio: string) => {
    const pcm16 = base64ToInt16(base64Audio);
    audioQueueRef.current.push(pcm16);

    // Start playback if not already playing and we have enough buffered
    if (!isPlayingRef.current && audioQueueRef.current.length >= BUFFER_SIZE) {
      playNextChunk();
    }
  }, []);

  /**
   * Play next audio chunk from queue
   */
  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }

    isPlayingRef.current = true;
    setIsPlaying(true);

    // Collect chunks until we have enough samples
    let totalSamples = 0;
    const chunksToPlay: Int16Array[] = [];

    while (
      audioQueueRef.current.length > 0 &&
      totalSamples < MIN_CHUNK_SIZE
    ) {
      const chunk = audioQueueRef.current.shift()!;
      chunksToPlay.push(chunk);
      totalSamples += chunk.length;
    }

    // Concatenate chunks
    const combined = new Int16Array(totalSamples);
    let offset = 0;
    for (const chunk of chunksToPlay) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to Float32
    const float32 = pcm16ToFloat32(combined);

    // Apply fade in/out
    for (let i = 0; i < FADE_SAMPLES && i < float32.length; i++) {
      const fade = i / FADE_SAMPLES;
      float32[i] *= fade;
    }
    for (let i = 0; i < FADE_SAMPLES && i < float32.length; i++) {
      const idx = float32.length - 1 - i;
      const fade = i / FADE_SAMPLES;
      float32[idx] *= fade;
    }

    // Create audio buffer and play (output is 24kHz from Gemini)
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    }

    const context = playbackContextRef.current;
    const buffer = context.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    source.onended = () => {
      playNextChunk();
    };

    source.start();
  }, []);

  /**
   * Clear audio queue and stop playback
   */
  const clearAudioQueue = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  /**
   * Cleanup on unmount
   */
  const cleanup = useCallback(() => {
    stopRecording();
    clearAudioQueue();

    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
  }, [stopRecording, clearAudioQueue]);

  return {
    isRecording,
    isPlaying,
    startRecording,
    stopRecording,
    queueAudio,
    clearAudioQueue,
    cleanup,
  };
}
