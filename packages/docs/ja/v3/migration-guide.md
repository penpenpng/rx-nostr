# Migration Guide

rx-nostr v2 からの移行を検討している場合、主要な変更点は[リリースノート](https://github.com/penpenpng/rx-nostr/releases/tag/v3.0.0)にまとまっています。移行のために最低限確認する必要がある事項は以下の通りです:

- 暗号まわりの依存はすべて rx-nostr-crypto パッケージに移されました。組み込みの verifier や signer を使っていた場合は、rx-nostr-crypto パッケージからエクスポートされているものを使ってください。
- `createRxNostr()` の `verifier` オプションは必須になりました。今まで同オプションを省略していた場合は、rx-nostr-crypto パッケージでエクスポートされている `verifier` を使用してください。
- `EventVerifier` は非同期関数に変更されました。
- deprecated としてマークされていた機能はすべて削除されました。v2 の JSDoc コメントの中で移行先のメソッドが示されているので、その案内に従ってコードを更新してください。
- [NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md) 関連の機能は削除されました。
- `rxNostr.send()` がタイムアウトによってエラー終了しなくなりました。この挙動はオプションで変更できます。v2 までの挙動が望ましい場合は `errorOnTimeout: true` を指定してください。
