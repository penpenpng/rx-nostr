# REQ lifecycle の契約テスト

2026-09-28 の決定を public API と controlled WebSocket を通して検証する。
時間経過には fake timers、署名・検証・認証の待機には deferred Promise を使う。
fixture はテスト失敗時にも RxNostr を dispose し、socket close を acknowledge する。

## 用語と確定した契約

- `RxReq`: 複数購読者が共有できる hot な入力。dispose は入力を完了する。
- request: 一回の emit または static filter 配列が表す要求。
- `vreq`: 一つの relay に対する logical request。
- `ConnectionDemandScope`: query が必要とする接続保持の管理単位。
- `RelayDemandWindow`: vreq の実行に対応する relay ごとの接続保持期間。
- backward の finalize は閉じた demand window の linger を打ち切らない。RxNostr.dispose は即時解放する。
- weak は既存 lease を利用し、接続開始中なら ready を待つ。自身では lease を取得・延長しない。

## テストの構成

以下のパスは `src/__test__/specs/` からの相対パス。

| ファイル                     | 保証する振る舞い                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query-linger.spec.ts`       | EOSE / CLOSED / timeout / unsubscribe / 宛先削除 / RxReq 完了 / 送信失敗後の linger。static と hot 入力。期限前・期限時の close。有限値と Infinity の dispose。期限内の再利用と古い期限の分離。emit ごとの linger 上書き                                                                                                                            |
| `query-destinations.spec.ts` | 両戦略の weak と一時宛先。既存 lease が接続中・接続済み・linger 中の場合。lease のない先への非接続と後からの接続による非復活。既定集合と一時集合の独立した変更・重複。hot / query / publish / weak の終了順序。weak による linger 延長の禁止。emit 前の prewarm 削除。forward の全宛先削除と再追加。backward の削除済み・EOSE 済み relay の非再実行 |
| `query-lifecycle.spec.ts`    | RxReq dispose 前後の active / queued backward REQ の完了と複数購読者。購読者の一部解除。dispose 済み source。非同期 verifier 完了後の通知抑止。forward 置換前に受信した EVENT と古い wire EVENT の区別。verifier 例外での複数 relay と queue の終了。接続済み・接続中・再接続待ち・linger 中の一括 dispose                                          |
| `query-recovery.spec.ts`     | backward 一括 unsubscribe と queue の非送信。forward の queued REQ 置換。queue 待機中の一部宛先削除。retry 待機中の置換・削除。共有 AUTH の一部解除。署名待ち・AUTH OK 待ち・publish 署名待ちの dispose と遅延完了                                                                                                                                  |

これらに既存 `query.spec.ts` の基本的な送受信・filter pipeline・再接続・複数 relay、`auth.spec.ts` の challenge 世代と認証共有、`facade.spec.ts` の disposed guard、`publish-lifecycle.spec.ts` の publish 回復を組み合わせる。

内部単体テストは `operation/demand/connection-demand-scope.test.ts` で有限 linger 後の所有者通知と dispose 後のタイマー非生成、`communication/scheduler/relay-req-scheduler.test.ts` で FIFO・容量・終端順序を検証する。weak の query mock も lease がないと即完了し、後からの接続で古い vreq を復活させない。

## 判定上の境界

- query の unsubscribe と RxReq の dispose と RxNostr の dispose は別の操作として検証する。
- 既に受信して verifier に渡した EVENT は forward 置換では破棄しない。query unsubscribe / RxNostr dispose 後は verifier が完了しても通知しない。
- 動的宛先の変更はその request にだけ適用し、hot 集合を宛先に流用しない。
- queue の一括解除中は後続 REQ を開始せず、解除が終わった後の microtask で残りの queue を処理する。
- 組み合わせは責務の境界と終了順序に基づいて選んでいる。全オプションの直積や実ネットワーク環境の網羅を意味しない。
