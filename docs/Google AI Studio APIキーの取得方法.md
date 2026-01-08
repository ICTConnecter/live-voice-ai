# Google AI Studio APIキーの取得方法

## 1. Google AI Studioにアクセス

[https://aistudio.google.com/](https://aistudio.google.com/) にアクセスします。

## 2. Googleアカウントでログイン

Googleアカウントでログインしてください。アカウントがない場合は新規作成が必要です。

## 3. APIキーの発行

1. 左側メニューから **「Get API key」** をクリック
2. **「Create API key」** ボタンをクリック
3. プロジェクトを選択（または新規作成）
4. 生成されたAPIキーをコピー

## 4. APIキーの設定

`backend/.env` ファイルを作成し、取得したAPIキーを設定します。

```bash
# backend/.env.example をコピー
cp backend/.env.example backend/.env
```

`.env` ファイルを編集:

```
GOOGLE_API_KEY=ここに取得したAPIキーを貼り付け
```

## 5. 注意事項

- APIキーは**絶対に公開しない**でください（GitHubなどにプッシュしない）
- `.env` ファイルは `.gitignore` に含まれていることを確認してください
- 無料枠には利用制限があります（詳細は[料金ページ](https://ai.google.dev/pricing)を参照）

## 6. 動作確認

```bash
docker compose up --build
```

ブラウザで `http://localhost:3000` にアクセスして動作を確認してください。

## トラブルシューティング

### APIキーが無効と表示される場合

- APIキーが正しくコピーされているか確認
- `.env` ファイルの場所が `backend/` 直下にあるか確認
- Dockerコンテナを再起動: `docker compose down && docker compose up --build`

### Gemini Live APIが利用できない場合

- 地域制限がある可能性があります
- Google AI Studioで対象APIが有効になっているか確認してください
