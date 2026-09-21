# v4 public model contract

This document fixes the public model used by Tasks 02–10. Later tasks may add completed capabilities, but must not silently change these semantics.

## Operations

### REQ

- `req()` returns a cold Observable. Each subscription creates an independent logical query and connection demand; merely calling `req()` does not open a connection.
- Passing filters directly creates a one-shot backward request. `RxForwardReq` replaces its previous segment, while `RxBackwardReq` keeps emitted segments active until their individual terminal conditions and completes after `over()` and all segments finish.
- A query result is `{ type: "EVENT", from, event, traceTag? }`. `traceTag` is copied from the originating `ReqPacket` across relays and any future physical split.
- Physical `subId`, logical `vreqId`, and protocol tuples containing them are internal. They are not properties of `EventPacket`.
- The public result pipeline is filter matching, signature verification, then NIP-40 expiration filtering. A disabled stage is skipped in that same position.
- A relay-local timeout, drop, CLOSED, or retry exhaustion terminates only that relay segment. It does not error a merged query while another relay can still produce results.
- Lazy filters are evaluated immediately before each physical send, including a reconnect resend. Local unsubscribe/removal/replacement sends CLOSE for an active physical REQ; EOSE or CLOSED terminal completion does not send a redundant CLOSE.
- A finite backward timeout starts only when its physical REQ leaves the NIP-11 queue. `0` requests immediate timeout and `Infinity` disables it. Timeout is relay-local completion and sends CLOSE for the active REQ.
- `RelayDirectory.maxSubscriptions` limits concurrent physical REQs per relay. Excess work is FIFO queued, queued cancellation never sends REQ/CLOSE, and a zero limit completes queued work instead of leaving it pending. Disposal completes both active and queued work without starting another REQ.

### Publication

- `publish()` snapshots normalized destinations and starts signing immediately when called. Later `RxRelays` changes do not affect that publication.
- The returned `Publication` is one hot operation. `subscribe()` observes the unaggregated `OkPacket` stream; unsubscribing only stops that observer and never cancels delivery.
- Task 08 must retain OK packets already received by the operation and replay them to a later subscriber before live packets. AUTH-related `OK false` packets remain observable even when a resend is pending.
- `cancel()` is idempotent and stops every remaining relay effort.
- `event` resolves to the immutable signed EVENT actually used by the operation. It rejects if signing cannot produce an EVENT or if there are no destinations.
- `waitFor("all")` and `waitFor("any")` resolve to `undefined`. `all` resolves only after every destination has final `OK true` and rejects as soon as a non-AUTH-pending final failure makes that impossible. `any` resolves on the first final `OK true` and rejects after every destination has finally failed. Resolving `any` does not cancel other efforts.
- no relay, cancellation, timeout, drop, retry exhaustion, and final `OK false` reject through `RxNostrPublicationError`; signer callback failure rejects through `RxNostrCallbackError`.

## Relay input

`RelayInput` is `RxRelays | Iterable<string> | string`.

- URLs are normalized and deduplicated at the boundary. Invalid URLs are ignored, preserving `RxRelays`/`RelaySet` behavior.
- An all-invalid input is therefore empty. An empty REQ completes without opening a connection. An empty publication rejects with publication code `no-relays`. Empty hot relays clear connection demand and send nothing.
- A dynamic `RxRelays` remains live for REQ and hot relays. Publication uses only its call-time snapshot.
- `ws://` and `wss://` hostnames are both accepted by `RelayUrl`; `ws://` is not limited to numeric hosts.

## Configuration and precedence

Built-in operation defaults are defined once in `RX_NOSTR_DEFAULTS`:

| Option           |         REQ |     publish |
| ---------------- | ----------: | ----------: |
| `defer`          |      `true` |         n/a |
| `linger`         | `10_000` ms | `10_000` ms |
| `weak`           |     `false` |     `false` |
| response timeout | `30_000` ms | `30_000` ms |

`authTimeout` is 30 seconds and NIP-11 fetching is enabled by default. AUTH itself has no implicit default: it is enabled only when an authenticator or per-relay authenticator factory is supplied. A REQ/publication may override the instance authenticator or use `false` to disable AUTH for that operation.

Precedence is the most specific defined value first:

1. a `ReqPacket` override (`relays`, `linger`, `traceTag`) where applicable;
2. the `req()` or `publish()` call config;
3. `RxNostrConfig.defaultOptions.req/publish`;
4. the root signer/verifier and built-in defaults.

Resolution uses nullish checks, so `false`, `0`, and `Infinity` are preserved. Stateful defaults such as the NIP-07 signer and retry policy are created once per RxNostr config, not once per property access.

`verifier` is required. Omitting it at runtime is `RxNostrInvalidUsageError`. A signer is optional and defaults to the per-instance `Nip07Signer`; an unavailable NIP-07 provider becomes a signer callback failure when publishing. A supplied authenticator is never inferred merely from the signer.

The optional WebSocket constructor is described by rx-nostr-owned structural types. No unipls type is part of configuration or any other public declaration.

## Relay directory

`GlobalRelayDirectory` is the default process-wide metadata/health store. An application or test can inject a distinct `RelayDirectory` through `RxNostrConfig.relayDirectory`; the directory does not own connections and cannot retry or close them.

- A normalized relay URL identifies one record. `get()` and iteration return immutable snapshots; `observe()` emits a new immutable snapshot when that record changes.
- NIP-11 reads are cached and concurrent requests for one relay are deduplicated. `{ refresh: true }` bypasses a completed cache, while `setNip11()` installs application-provided metadata. Successful and failed fetch times are tracked separately, and a valid non-negative integer `limitation.max_subscriptions` is exposed as `maxSubscriptions`.
- Creating a relay pool entry starts the cached NIP-11 fetch unless `skipFetchNip11` is true. Fetch failure does not fail the operation. Skipping fetch does not disable metadata already present in the configured directory, including `maxSubscriptions`.
- Connection health contains the latest successful/failed timestamps, consecutive failures, and the currently observed connection count across reporters. A successful connection resets consecutive failures. Public entries expose no socket, retry operation, or mutable reporter.
- `exportSnapshot()` returns version 1 JSON. `importSnapshot()` validates the complete input before merging it with newer/live local data. NIP-11 metadata and health timestamps/counters are persistent; live connection counts and handles are not. Invalid JSON, schema, and unsupported versions are typed errors.

## Packet naming

- `from` is the canonical relay-origin property for inbound EVENT/OK and connection-state packets.
- `message` is the canonical name for an exposed protocol tuple. `raw` is not public.
- Query EVENT results intentionally expose neither `message` nor any other tuple because the EVENT tuple contains a physical `subId`.
- EOSE, CLOSED, COUNT, AUTH, NOTICE, unknown protocol packets, and their physical identifiers remain adapter/query-engine internals unless a later explicit decision introduces a safe public model.

## Connection state

`ConnectionState` is an immutable rx-nostr discriminated union: `dormant`, `connecting`, `connected`, `waiting-for-retry`, `retrying`, `failed`, or `disposed`. Retry states carry one-based attempts; wait state carries its delay; failure states contain only an rx-nostr `ConnectionFailure` snapshot. Transport implementation objects are not exposed.

`monitorConnectionState()` observes every relay entry that already exists in the instance pool and entries created later. Subscribing does not itself create a relay entry or open a connection. Each relay stream replays its latest state to a new observer; identical consecutive snapshots are suppressed, while relay ordering remains independent.

- `dormant` means there is no connection demand; it is not a failure.
- `connecting` is the first physical attempt. `waiting-for-retry` is emitted after the retry policy chooses a valid delay, and `retrying` identifies the corresponding one-based retry attempt.
- `failed` is an unexpected terminal outcome and contains a transport-independent failure snapshot. Peer close code/reason may be copied, but mutable transport errors and unipls identifiers are not exposed.
- Releasing the final lease produces `dormant` and never starts automatic retry. Disposing emits `disposed` to existing observers and prevents a pending retry from creating another socket.

The `ConnectionRetryer` receives the aggregate health snapshot from the configured RelayDirectory after the triggering failure has been recorded. The directory remains observational: the retryer decision is executed only by the owning RxNostr instance/unipls session.

## Error boundaries

- Invalid relay strings are filtered as described above; they are not callback or transport errors.
- A disposed instance rejects new work with `RxNostrAlreadyDisposedError`. Immediate mutators and `publish()` throw at their call boundary; a cold REQ reports the error when subscribed.
- Exceptions from lazy filters, signer, verifier, or authenticator are wrapped in `RxNostrCallbackError` with the callback kind and original value as `cause`. Query callback errors shared by the operation may error the whole query; relay-local failures may not.
- Environment failures such as an unavailable browser signer remain available as the callback error's cause.
