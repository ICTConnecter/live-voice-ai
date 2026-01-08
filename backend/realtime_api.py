"""
Google Gemini Live API handler for voice chat
Real-time bidirectional audio conversation using Gemini
"""
import asyncio
import base64
from typing import Callable, Optional
from google import genai
from google.genai import types


class GeminiLiveSession:
    """
    Gemini Live API session for real-time voice conversation.
    Handles STT, LLM, and TTS in a unified session.
    """

    def __init__(self, api_key: str, voice: str = "Kore", language: str = "ja"):
        self.api_key = api_key
        self.voice = voice
        self.language = language
        self.client = genai.Client(api_key=api_key)
        self.session = None
        self._audio_queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._transcript_queue: asyncio.Queue[dict] = asyncio.Queue()
        self._receive_task: Optional[asyncio.Task] = None
        self._session_task: Optional[asyncio.Task] = None
        self._is_running = False
        self._session_ready = asyncio.Event()

    def _get_config(self) -> types.LiveConnectConfig:
        """Get the session configuration"""
        return types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self.voice
                    )
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=f"""あなたは親切で丁寧な日本語のAIアシスタントです。
ユーザーとの自然な会話を心がけてください。
回答は簡潔にしてください（1-3文程度）。
言語: {self.language}""")]
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )

    async def _run_session(self) -> None:
        """Run the session within async with context"""
        # Model that supports Live API (bidiGenerateContent)
        model = "gemini-2.0-flash-exp"
        config = self._get_config()

        try:
            async with self.client.aio.live.connect(
                model=model,
                config=config
            ) as session:
                self.session = session
                self._session_ready.set()

                # Process responses while running
                async for response in session.receive():
                    if not self._is_running:
                        break

                    if response.server_content:
                        content = response.server_content

                        # Input transcription (user speech)
                        if content.input_transcription:
                            text = content.input_transcription.text
                            if text and text.strip():
                                await self._transcript_queue.put({
                                    "type": "user",
                                    "text": text.strip()
                                })

                        # Output transcription (assistant response)
                        if content.output_transcription:
                            text = content.output_transcription.text
                            if text and text.strip():
                                await self._transcript_queue.put({
                                    "type": "assistant",
                                    "text": text.strip()
                                })

                        # Audio parts
                        if content.model_turn and content.model_turn.parts:
                            for part in content.model_turn.parts:
                                if part.inline_data and part.inline_data.data:
                                    await self._audio_queue.put(part.inline_data.data)

                        # Turn complete
                        if content.turn_complete:
                            await self._audio_queue.put(None)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error in Gemini session: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.session = None
            self._session_ready.clear()

    async def connect(self) -> None:
        """Connect to Gemini Live API"""
        self._is_running = True
        self._session_task = asyncio.create_task(self._run_session())
        # Wait for session to be ready
        await asyncio.wait_for(self._session_ready.wait(), timeout=30.0)

    async def send_audio(self, audio_base64: str) -> None:
        """
        Send audio chunk to Gemini Live API.
        Audio should be PCM16 at 16kHz.
        """
        if self.session and self._is_running:
            audio_bytes = base64.b64decode(audio_base64)
            await self.session.send_realtime_input(
                audio=types.Blob(
                    data=audio_bytes,
                    mime_type="audio/pcm;rate=16000"
                )
            )

    async def get_audio_chunks(self, on_audio_chunk: Callable[[str], None]) -> None:
        """
        Get audio response chunks and call callback for each.
        Audio is returned as base64 encoded PCM at 24kHz.
        """
        while self._is_running:
            try:
                audio_data = await asyncio.wait_for(
                    self._audio_queue.get(),
                    timeout=0.1
                )
                if audio_data is None:
                    break
                audio_b64 = base64.b64encode(audio_data).decode("utf-8")
                await on_audio_chunk(audio_b64)
            except asyncio.TimeoutError:
                continue
            except Exception:
                break

    async def get_transcripts(self):
        """
        Async generator yielding transcripts as they arrive.
        Yields dict with 'type' (user/assistant) and 'text'.
        """
        while self._is_running:
            try:
                transcript = await asyncio.wait_for(
                    self._transcript_queue.get(),
                    timeout=0.1
                )
                yield transcript
            except asyncio.TimeoutError:
                continue
            except Exception:
                break

    async def close(self) -> None:
        """Close the session"""
        self._is_running = False
        if self._session_task:
            self._session_task.cancel()
            try:
                await self._session_task
            except asyncio.CancelledError:
                pass


class SimpleLLM:
    """
    Simple LLM wrapper using Gemini for text-only chat.
    Fallback for non-audio interactions.
    """

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.conversation_history: list[types.Content] = []
        self.system_prompt = """あなたは親切で丁寧な日本語のAIアシスタントです。
ユーザーとの自然な会話を心がけてください。
回答は簡潔にしてください（1-3文程度）。"""

    def reset(self):
        """Reset conversation history"""
        self.conversation_history = []

    async def chat(self, user_message: str) -> str:
        """Send a message and get a response"""
        self.conversation_history.append(
            types.Content(
                role="user",
                parts=[types.Part(text=user_message)]
            )
        )

        contents = [
            types.Content(
                role="user",
                parts=[types.Part(text=self.system_prompt)]
            ),
            types.Content(
                role="model",
                parts=[types.Part(text="はい、承知しました。簡潔に丁寧にお答えします。")]
            ),
            *self.conversation_history
        ]

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                max_output_tokens=200,
                temperature=0.7,
            )
        )

        reply = response.text

        self.conversation_history.append(
            types.Content(
                role="model",
                parts=[types.Part(text=reply)]
            )
        )

        return reply
