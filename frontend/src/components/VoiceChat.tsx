"use client";

import { useEffect, useRef } from "react";
import { useVoiceChat, Message } from "../hooks/useVoiceChat";

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.sender === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[80%] px-4 py-2 rounded-2xl ${
          isUser
            ? "bg-blue-500 text-white rounded-br-md"
            : "bg-gray-200 text-gray-800 rounded-bl-md"
        }`}
      >
        <p className="text-sm">{message.text}</p>
        <p
          className={`text-xs mt-1 ${
            isUser ? "text-blue-100" : "text-gray-500"
          }`}
        >
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function StatusIndicator({
  status,
}: {
  status: "disconnected" | "connecting" | "connected" | "error";
}) {
  const colors = {
    disconnected: "bg-gray-400",
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-green-400",
    error: "bg-red-400",
  };

  const labels = {
    disconnected: "切断中",
    connecting: "接続中...",
    connected: "接続済み",
    error: "エラー",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${colors[status]}`} />
      <span className="text-sm text-gray-600">{labels[status]}</span>
    </div>
  );
}

export function VoiceChat() {
  const {
    connectionStatus,
    isRecording,
    isPlaying,
    messages,
    error,
    connect,
    disconnect,
    toggleRecording,
    resetConversation,
  } = useVoiceChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isConnected = connectionStatus === "connected";

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-800">
          音声AIチャット
        </h1>
        <StatusIndicator status={connectionStatus} />
      </header>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            <p className="text-center">
              マイクボタンを押して
              <br />
              話しかけてください
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Controls */}
      <div className="px-4 py-4 border-t border-gray-200 bg-white">
        <div className="flex items-center justify-center gap-4">
          {/* Connect/Disconnect button */}
          {connectionStatus === "disconnected" ||
          connectionStatus === "error" ? (
            <button
              onClick={connect}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              接続
            </button>
          ) : connectionStatus === "connecting" ? (
            <button
              disabled
              className="px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
            >
              接続中...
            </button>
          ) : (
            <>
              {/* Microphone button */}
              <button
                onClick={toggleRecording}
                disabled={!isConnected}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : "bg-blue-500 hover:bg-blue-600"
                } disabled:bg-gray-300 disabled:cursor-not-allowed`}
              >
                {isRecording ? (
                  <svg
                    className="w-8 h-8 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg
                    className="w-8 h-8 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                )}
              </button>

              {/* Playing indicator */}
              {isPlaying && (
                <div className="flex items-center gap-1">
                  <div className="w-1 h-4 bg-blue-500 animate-pulse rounded" />
                  <div className="w-1 h-6 bg-blue-500 animate-pulse rounded delay-75" />
                  <div className="w-1 h-4 bg-blue-500 animate-pulse rounded delay-150" />
                </div>
              )}

              {/* Reset button */}
              <button
                onClick={resetConversation}
                disabled={!isConnected || messages.length === 0}
                className="p-2 text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                title="会話をリセット"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>

              {/* Disconnect button */}
              <button
                onClick={disconnect}
                className="p-2 text-red-500 hover:text-red-700"
                title="切断"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Recording status */}
        {isRecording && (
          <p className="text-center text-sm text-red-500 mt-2">
            録音中... 話してください
          </p>
        )}
      </div>
    </div>
  );
}
