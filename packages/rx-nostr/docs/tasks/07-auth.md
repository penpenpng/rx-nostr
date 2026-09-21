# Task 07: NIP-42 AUTH

## 目的

relay ごとに AUTH challenge を調停し、同時 operation が安全に認証結果を共有して REQ/EVENT を必要な場合だけ再送できるようにする。

## 作業

- D7 に従い authenticator config（instance default、relay factory、operation override の有無）を固定する。
- relay message stream から AUTH challenge を監視し、`Authenticator.challenge(relay, challenge)` で kind 22242 event を作る。
- `['AUTH', signedEvent]` を送信し、その event id の OK と timeout を待つ。
- 同じ challenge に対する concurrent auth を dedupe し、新しい challenge との順序を定義する。
- `auth-required:` CLOSED/OK を machine-readable prefix として parse し、対象 REQ/EVENT を AUTH 成功後に一回再送する。
- authenticator missing、sign rejection、OK false、timeout、drop/reconnect を typed result にする。
- NIP-07 prompt を意図せず自動で起動しないことを contract test する。

## 受入条件

- auth disabled 時は challenge に応答せず、operation は定義済みの rejected/failure result になる。
- auth enabled 時は AUTH event の relay/challenge tag と signature source が正しい。
- concurrent REQ/publish が一つの successful auth を共有できる。
- auth failure loop で operation を無限再送しない。
- reconnect 後に古い challenge/auth OK が新 connection の operation を再開しない。
- auth timer/listener が成功、失敗、unsubscribe、dispose の全経路で解放される。

## 非目標

- credential 永続化
- relay 独自の NIP-42 外認証
- unipls provisioning phase への Nostr AUTH の移動（AUTH は protocol operation として扱う）

## 実装結果

2026-09-21 に完了。

- relay ごとの internal `AuthCoordinator` が最新 challenge と connection generation を保持する。同じ challenge の同時認証は一つの AUTH event/OK 待機を共有し、異なる challenge または reconnect は旧結果を stale にする。
- AUTH は明示された authenticator だけを使用する。operation の `false` override は他 operation の認証に便乗せず、その operation の再送を無効化する。authenticator factory は normalized relay URL で解決する。
- `SimpleAuthenticator` と public `Authenticator` は kind 22242 の event を返し、relay/challenge tag を signer に渡す型契約に固定した。
- `auth-required:` CLOSED は REQ、同 prefix の `OK false` は EVENT を認証成功後に一度だけ再送する。再送後の二度目の auth-required は loop させず relay-local terminal にする。
- authenticator/factory の例外は `RxNostrCallbackError("authenticator")`、auth disabled、challenge missing、OK false、timeout、stale generation、transport failure は relay-local authentication failure として operation を終了する。
- AUTH waiter は AbortSignal と参照数を持つ。最後の operation の unsubscribe または relay dispose で、未送信 AUTH、OK timeout、message listener を解放する。
- controlled WebSocket の public contract で opt-in、per-operation disable、dedupe、署名内容、OK false、timeout、callback error、新 challenge、reconnect、unsubscribe、再送上限を検証した。publish Task 08 が利用する EVENT/OK substrate も AUTH後の再送と progress を unit test で固定した。
