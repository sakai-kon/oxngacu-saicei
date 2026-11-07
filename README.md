# Music Search

iTunes Search API を利用した、静的な音楽検索サイトの仮実装です。

## 主な機能

- 曲名・アーティスト名で日本の iTunes カタログを検索
- 最大30件の検索結果をカード形式で表示
- ジャケット画像、曲名、アーティスト名、アルバム名、曲の長さを表示
- APIから試聴URLが返る曲はブラウザ上で再生
- Apple Music の作品ページへのリンク
- PC・タブレット・スマートフォンに対応

## 技術構成

- HTML / CSS / Vanilla JavaScript
- iTunes Search API
- サーバー・ビルドツール・APIキー不要

## ローカルでの確認

```bash
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

## GitHub Pages

GitHub のリポジトリ設定から **Settings → Pages → Build and deployment → Deploy from a branch** を選び、Branch を `main`、Folder を `/ (root)` に設定してください。

## 注意事項

- 検索結果や試聴URLは iTunes Search API の応答に依存します。
- 試聴音源が返されない楽曲は再生できません。
- ジャケット画像・試聴音源・作品リンクは各提供元の利用条件に従ってください。
- このサイトは検索結果を表示する独立した非公式サンプルで、Apple の公式サービスではありません。
