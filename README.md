# Live Voice AI

Google Gemini Live APIを活用したリアルタイム音声チャットアプリケーションです。自然な双方向の音声会話をAIアシスタントと日本語で行うことができます。

## 機能

- リアルタイム音声チャット（双方向オーディオストリーミング）
- 音声認識（STT）: ユーザーの発話を自動でテキストに変換
- 音声合成（TTS）: AIの応答を自然な音声で出力
- リアルタイム文字起こし表示
- WebSocketによる低遅延通信
- 会話履歴の表示と接続状態インジケーター
- セッション管理（接続、切断、会話リセット）

## 動作に必要な環境

### 必須要件

- **Docker** および **Docker Compose**
  - または Node.js 18以上 + Python 3.9以上（ローカル実行時）
- **Google API Key**（Gemini Live API用）

### API Keyの取得

1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
2. APIキーを作成・取得
3. `backend/.env.example` を `backend/.env` にコピー
4. 取得したAPIキーを `backend/.env` に設定

```bash
cp backend/.env.example backend/.env
# .envファイルを編集してAPIキーを設定
```

## 使い方

### Docker Composeで起動（推奨）

```bash
# ビルドして起動
docker compose up --build

# バックグラウンドで起動する場合
docker compose up --build -d
```

起動後、以下のURLにアクセス:
- **フロントエンド**: http://localhost:3000
- **バックエンド**: http://localhost:8080

停止する場合:
```bash
docker compose down
```

### ローカル環境で起動

#### バックエンド

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

#### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

### アプリの使用方法

1. ブラウザで http://localhost:3000 を開く
2. 「接続」ボタンをクリックしてセッションを開始
3. マイクボタンを押して話しかける
4. AIからの音声応答とテキストがリアルタイムで表示される
5. 会話を終了する場合は「切断」ボタンをクリック

## プロジェクト構成

```
live-voice-ai/
├── frontend/          # Next.js フロントエンド
│   ├── src/
│   │   ├── app/       # ページコンポーネント
│   │   ├── components/# UIコンポーネント
│   │   └── hooks/     # カスタムフック（音声処理、WebSocket）
│   └── package.json
├── backend/           # FastAPI バックエンド
│   ├── main.py        # APIエンドポイント
│   ├── realtime_api.py# Gemini Live API連携
│   └── requirements.txt
├── compose.yaml       # Docker Compose設定
└── README.md
```

## 技術スタック

### フロントエンド
- Next.js 15.3
- React 19
- TypeScript
- Tailwind CSS

### バックエンド
- FastAPI
- Google Gemini Live API
- WebSocket

### インフラ
- Docker / Docker Compose
