# 公開前監査の実施タスク

F15（英語v4の空ページ）はユーザーが許容済み。それ以外の15指摘、内部設計・API契約の改善6件、テスト拡充11件、最終検証1件を **33タスク** に分割した。各ファイルは単独で着手可能な背景・対象・手順・受入条件・検証・依存関係を含む。番号15はF15を再導入しないため欠番とする。

ユーザーはタスク説明作成後の順次実装とタスクごとのcommitを依頼している。原則は以下の番号順（依存関係もこの順で満たす）。説明ファイル作成を完了とみなさず、各修正の最小回帰テストを同じタスクで実施する。後半のテストタスクは局所修正を越える組み合わせと配布/runtimeの保証を追加する。

| 番号 | タスク                                                                                      | 優先度 | 対応元                | 先行                                                                           | 状態   |
| ---- | ------------------------------------------------------------------------------------------- | ------ | --------------------- | ------------------------------------------------------------------------------ | ------ |
| 01   | [F01: EVENT の ID と署名検証の整合性](01-verify-event-id.md)                                | P1     | F01                   | —                                                                              | 未着手 |
| 02   | [F02: OK 通知を内部の成功判定から分離する](02-isolate-publication-ok.md)                    | P1     | F02                   | —                                                                              | 未着手 |
| 03   | [F03: README と日本語 v4 docs を現行 API に揃える](03-align-v4-documentation.md)            | P1     | F03                   | —                                                                              | 未着手 |
| 04   | [F04: WASM パッケージの型 exports を修正する](04-fix-wasm-type-exports.md)                  | P1     | F04                   | —                                                                              | 未着手 |
| 05   | [F05: legacy cast の完了を実際の送信と結び付ける](05-wait-for-legacy-send.md)               | P1     | F05                   | —                                                                              | 未着手 |
| 06   | [F06: legacy AUTH adapter の委譲を修正する](06-preserve-authenticator-methods.md)           | P2     | F06                   | —                                                                              | 未着手 |
| 07   | [F07: relay URL の query 値を保持する](07-preserve-relay-query-values.md)                   | P2     | F07                   | —                                                                              | 未着手 |
| 08   | [F08: filter の 0 の時刻境界を保持する](08-preserve-zero-time-bounds.md)                    | P2     | F08                   | —                                                                              | 未着手 |
| 09   | [F09: static と emitted filter の意味を統一する](09-unify-query-filter-inputs.md)           | P2     | F09                   | 08                                                                             | 未着手 |
| 10   | [F10: 同時刻 EVENT の ID 優先順を修正する](10-correct-event-tie-break.md)                   | P2     | F10                   | —                                                                              | 未着手 |
| 11   | [F11: Worker verifier の pending request を終了する](11-settle-worker-on-dispose.md)        | P2     | F11                   | —                                                                              | 未着手 |
| 12   | [F12: Worker verifier の timeout を正しい deadline にする](12-enforce-worker-deadline.md)   | P2     | F12                   | 11                                                                             | 未着手 |
| 13   | [F13: Worker verifier の処理例外を伝播する](13-propagate-worker-errors.md)                  | P2     | F13                   | 12                                                                             | 未着手 |
| 14   | [F14: 派生 RxReq の寿命を独立して管理する](14-dispose-derived-rxreq.md)                     | P2     | F14                   | —                                                                              | 未着手 |
| 16   | [F16: runtime と polyfill のサポート契約を定義する](16-define-runtime-support.md)           | P2     | F16                   | —                                                                              | 未着手 |
| 17   | [内部設計: 公開値と内部状態の所有権を統一する](17-standardize-public-value-ownership.md)    | P2     | 設計改善1             | 02                                                                             | 未着手 |
| 18   | [内部設計: 操作の完了とリソース解放の責務を整理する](18-clarify-operation-lifecycle.md)     | P2     | 設計改善2             | 05, 11, 12, 13, 14                                                             | 未着手 |
| 19   | [内部設計: 入力正規化の境界を整理する](19-centralize-input-boundaries.md)                   | P2     | 設計改善3             | 01, 08, 09                                                                     | 未着手 |
| 20   | [内部設計: RelayDirectory の拡張可能性を明確にする](20-clarify-directory-extension.md)      | P2     | 設計改善4             | —                                                                              | 未着手 |
| 21   | [API設計: timeout と linger の数値契約を揃える](21-validate-numeric-options.md)             | P2     | API総合評価           | 12                                                                             | 未着手 |
| 22   | [API設計: EVENT の構造検査と暗号検証を区別する](22-define-event-validation-contract.md)     | P2     | API総合評価           | 01                                                                             | 未着手 |
| 23   | [テスト拡充: crypto 二実装の共通検証ベクタ](23-expand-crypto-vectors.md)                    | P2     | 暗号テスト            | 01, 22                                                                         | 未着手 |
| 24   | [テスト拡充: tarball の public entry と型を検査する](24-test-packed-consumers.md)           | P1     | 配布テスト            | 04, 16                                                                         | 未着手 |
| 25   | [テスト拡充: README と docs のサンプルを型検査する](25-typecheck-documentation-examples.md) | P1     | docsテスト            | 03, 24                                                                         | 未着手 |
| 26   | [テスト拡充: publication の observer と再入](26-test-publication-reentrancy.md)             | P2     | publicationテスト     | 02, 05, 17, 18                                                                 | 未着手 |
| 27   | [テスト拡充: legacy facade の互換契約](27-expand-legacy-contract-tests.md)                  | P2     | legacyテスト          | 05, 06, 18                                                                     | 未着手 |
| 28   | [テスト拡充: filter の境界と入力形式の同値性](28-expand-filter-boundary-tests.md)           | P2     | filter/URLテスト      | 07, 08, 09, 19, 21                                                             | 未着手 |
| 29   | [テスト拡充: operators と packet option の保持](29-expand-operator-contract-tests.md)       | P2     | operatorテスト        | 10, 14                                                                         | 未着手 |
| 30   | [テスト拡充: Worker verifier の protocol と実 Worker](30-test-worker-verifier-protocol.md)  | P2     | Workerテスト          | 11, 12, 13, 16, 21                                                             | 未着手 |
| 31   | [テスト拡充: RxReq と query の寿命を検証する](31-test-request-lifecycle.md)                 | P2     | RxReq/lifecycleテスト | 14, 18                                                                         | 未着手 |
| 32   | [テスト拡充: 最低サポート runtime で配布物を実行する](32-test-supported-runtimes.md)        | P2     | runtimeテスト         | 16, 24                                                                         | 未着手 |
| 33   | [テスト拡充: 実 signer/verifier と既定動作の統合](33-test-default-stack-integration.md)     | P2     | 統合テスト            | 01, 17, 18, 20, 22, 23                                                         | 未着手 |
| 34   | [最終検証: version 適用後の公開契約を確認する](34-verify-release-readiness.md)              | P1     | 公開前完了条件        | 03, 04, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33 | 未着手 |

## 実施規則

- 各ファイルの完了記録とこの表の状態を更新し、実装・検証・説明を一つのtask commitにまとめる。
- 現在のbaselineは既存test/build/docs/lint/format成功。ただし監査の不具合はそれらで検出されなかった。成功を根拠に指摘を無視しない。
- 先行修正と後続テストの境界を守る。仕様を変える必要が判明したら根拠を記録し、互換性の判断が必要ならユーザーへ質問する。
- タスク20はconcrete Directoryの契約明確化が最小方針。新しい独自実装injection能力は無条件に追加しない。
- タスク16/32のruntime範囲と、09/21/29の未定義入力方針は公開契約の選択を伴う。既存の明示契約を保ち、選択が必要なら具体的な案を示す。
- 空の英語v4を公開阻害条件に戻さない。F15の翻訳/案内/ナビ変更は今回の作業対象外。
- npm publish、push、mergeは今回のtask実行に含めない。

監査元: [report.md](../report.md)。監査レポートは発見時点の記録であり、現在の許容事項はこのタスク群とユーザーの指示を優先する。
