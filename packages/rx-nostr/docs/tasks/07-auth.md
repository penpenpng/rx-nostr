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
