import asyncio
import json
import os
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from realtime_api import GeminiLiveSession

# Load environment variables
load_dotenv()

app = FastAPI()

# CORSミドルウェアの設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静的ファイルを提供する場所を設定
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def get_index():
    return FileResponse("static/index.html")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


class VoiceChatSession:
    """Voice chat session using Gemini Live API"""

    def __init__(self, websocket: WebSocket, api_key: str):
        self.websocket = websocket
        self.api_key = api_key
        self.gemini = GeminiLiveSession(api_key, voice="Kore", language="ja")
        self.is_running = False

    async def start(self):
        """Start the voice chat session"""
        await self.gemini.connect()
        self.is_running = True

    async def stop(self):
        """Stop the voice chat session"""
        self.is_running = False
        await self.gemini.close()

    async def process_audio(self, audio_base64: str):
        """Process incoming audio from client"""
        await self.gemini.send_audio(audio_base64)

    async def process_responses(self):
        """Process responses from Gemini (transcripts and audio)"""
        # Start tasks for handling transcripts and audio
        transcript_task = asyncio.create_task(self._handle_transcripts())
        audio_task = asyncio.create_task(self._handle_audio())

        try:
            await asyncio.gather(transcript_task, audio_task)
        except asyncio.CancelledError:
            pass

    async def _handle_transcripts(self):
        """Handle transcript messages from Gemini"""
        async for transcript in self.gemini.get_transcripts():
            if not self.is_running:
                break

            await self.websocket.send_json({
                "type": "transcript",
                "text": transcript["text"],
                "sender": transcript["type"]
            })

    async def _handle_audio(self):
        """Handle audio chunks from Gemini"""
        while self.is_running:
            try:
                await self.gemini.get_audio_chunks(self._send_audio_chunk)
                # Signal audio complete after each response
                await self.websocket.send_json({
                    "type": "audio.done"
                })
            except Exception:
                if not self.is_running:
                    break
                await asyncio.sleep(0.1)

    async def _send_audio_chunk(self, audio_base64: str):
        """Send audio chunk to client"""
        await self.websocket.send_json({
            "type": "response.audio.delta",
            "delta": audio_base64
        })


@app.websocket("/ws/voice")
async def voice_chat_endpoint(websocket: WebSocket):
    """WebSocket endpoint for voice chat"""
    await websocket.accept()

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        await websocket.send_json({
            "type": "error",
            "message": "Google API key not configured"
        })
        await websocket.close(code=4010)
        return

    session = VoiceChatSession(websocket, api_key)

    try:
        await session.start()

        # Send ready message
        await websocket.send_json({
            "type": "session.ready"
        })

        # Start response processing task
        response_task = asyncio.create_task(session.process_responses())

        # Receive audio from client
        while True:
            try:
                message = await websocket.receive_json()
                msg_type = message.get("type", "")

                if msg_type == "input_audio_buffer.append":
                    audio_data = message.get("delta", "")
                    if audio_data:
                        await session.process_audio(audio_data)

                elif msg_type == "session.reset":
                    # Reconnect to reset the session
                    await session.stop()
                    session = VoiceChatSession(websocket, api_key)
                    await session.start()
                    response_task.cancel()
                    response_task = asyncio.create_task(session.process_responses())
                    await websocket.send_json({
                        "type": "session.reset.done"
                    })

            except WebSocketDisconnect:
                break
            except json.JSONDecodeError:
                continue

    except Exception as e:
        print(f"Voice chat error: {e}")
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })

    finally:
        await session.stop()


# Keep the original WebSocket endpoint for backward compatibility
class WebSocketManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)


manager = WebSocketManager()


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int):
    await manager.connect(websocket)
    await manager.broadcast(f"Client #{client_id} joined")
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"Client #{client_id}: {data}")
    except Exception as e:
        print(f"エラー発生: {e}")
    finally:
        manager.disconnect(websocket)
        await manager.broadcast(f"Client #{client_id} left")
