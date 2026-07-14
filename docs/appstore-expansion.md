# App Store展開プラン（展開フェーズでやること）

- 作成: 2026-07-14
- 前提: POC（GitHub Pages / PWA配布）で同期比較の需要が確認できたら着手する。POC段階では何もしない
- 方式: **Capacitor等によるWebアプリのラップを本線とする**。React Native等でのネイティブ書き直しは、Webでは実現できない体験（本格的なオフライン比較等）が必須になった場合の次善策

## なぜそのままでは出せないか

- GitHub Pages / PWAはApp Storeに並ばない（iOSのPWAは「ホーム画面に追加」のみで、ストア検索での発見性はゼロ）
- Apple審査ガイドライン **4.2 Minimum Functionality** により、「Webサイトを包んだだけ」のアプリはリジェクトされる。ネイティブらしい機能・体験の追加が実質必須

## やることリスト

### 1. 審査対策を兼ねたネイティブ機能の実装（4.2対策）
- [ ] タイマー付きカメラ撮影→即比較（F-14。フェーズ1.5要件と一石二鳥）
- [ ] オフライン動作（端末内動画の比較はネットワークなしで完結させる）
- [ ] 端末のフォトライブラリとの深い連携（動画の読み込み・書き出し）
- [ ] （任意）骨格推定のネイティブSDK化: WASM推論はWebView内でも動くが性能が劣るため、MediaPipeのiOS/Android SDKへの差し替えを検討

### 2. Capacitor化の技術作業
- [ ] Capacitorプロジェクトのセットアップ（既存Vite+Reactをそのままwrap）
- [ ] WKWebViewでの動作確認: `playsinline`、`requestVideoFrameCallback`、2動画同時再生、presigned URLアップロード（クラウド機能を使う場合）
- [ ] service worker / PWAキャッシュとCapacitorの共存整理（Capacitor内ではsw不要になる想定）
- [ ] カメラ・フォトライブラリのパーミッション実装（Info.plistの利用目的文言）

### 3. Apple側の手続き・体制
- [ ] Apple Developer Program登録（年99ドル、個人 or 法人を決める）
- [ ] App Store Connectでのアプリ登録、Bundle ID決定
- [ ] プライバシーポリシーの作成・公開（requirements.md 4.3。動画・アカウント情報の扱いを明記）
- [ ] App Privacy（プライバシーラベル）の申告内容整理
- [ ] スクリーンショット・アプリ説明文などストア素材の準備
- [ ] TestFlightでのベータ配布→審査提出

### 4. 併せて決める必要があるもの（requirements.mdオープンイシューと連動）
- [ ] 収益化方針（オープンイシュー#1）: 課金を入れるならIn-App Purchase必須（Apple手数料15〜30%）。サブスクの外部決済誘導は制約が多い
- [ ] クラウド機能（アカウント・R2アップロード）をアプリ初版に含めるか: 含めるならアカウント削除機能が審査要件（ガイドライン5.1.1(v)）

## Google Play（参考）
- AndroidはTWA（Trusted Web Activity）でPWAをほぼそのままストアに出せるため、iOSより障壁が低い。Capacitor化すれば両OS同時に出せるので、方式はiOS側の制約に合わせて決めれば良い
