# v3 test contract audit

This audit maps every test scenario that existed under the former
`packages/rx-nostr/src/__test__` tree to the v4 contract. The v3 source and
tests were removed when the v4 implementation moved from `next` to `src`.

The classification follows [behavior-matrix.md](./behavior-matrix.md):

- `keep`: preserve the observable capability, even if the API shape changed.
- `replace`: verify the equivalent v4 concept instead of copying the v3 test.
- `remove`: the v3 behavior is intentionally absent from v4.

## AUTH

| v3 scenario                         | Classification | v4 coverage                                                                                    |
| ----------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Respond to the first AUTH challenge | replace        | `src/__test__/contract/auth.spec.ts`: explicit opt-in and `SimpleAuthenticator` event contents |
| Respond to an additional challenge  | replace        | `auth.spec.ts`: new challenge invalidates stale work and is generation scoped                  |
| Resend an auth-rejected REQ         | keep           | `auth.spec.ts`: deduplicated AUTH and one resend per REQ                                       |

The old persisted-challenge/aggressive-strategy setup is not copied. v4
scopes challenges to a transport generation and expresses connection demand
through hot relays and leases.

## Connection lifetime and relay membership

| v3 scenario                                                            | Classification | v4 coverage                                                                                   |
| ---------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| keep-lazy default relay remains connected after subscriptions          | replace        | `src/rx-nostr/modules/relay-warmer.test.ts`: hot and query leases are independent             |
| keep-lazy temporary relay becomes dormant immediately or after timeout | replace        | `src/rx-nostr/query-session.test.ts`: `linger` retains and releases the lease                 |
| aggressive default relay connects immediately                          | replace        | `relay-warmer.test.ts`: hot demand opens without sending protocol messages                    |
| aggressive relay becomes temporary/non-default                         | replace        | `relay-warmer.test.ts`: dynamic hot-set removal releases only the hot lease                   |
| adding/removing default relays updates a live forward REQ              | replace        | `src/rx-nostr/modules/req-forward.test.ts`: dynamic `RxRelays` starts/stops relay segments    |
| temporary relay segment survives changes to defaults                   | replace        | `req-forward.test.ts` and `req-backward.test.ts`: segment-scoped relay inputs are independent |
| emit-scoped temporary relays                                           | replace        | `req-backward.test.ts`: packet relay overrides take precedence                                |

The v3 `lazy`, `keep-lazy`, and `aggressive` implementations are not stable
v4 contracts. Their declared effects are covered through `defer`, `weak`,
`linger`, hot relays, dynamic destinations, and connection state.

## REQ, EVENT, EOSE, and queueing

| v3 scenario                                            | Classification | v4 coverage                                                                    |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------ |
| Forward packets replace the current REQ                | keep           | `src/__test__/contract/query.spec.ts`: replacement and local CLOSE             |
| A forward request reused one physical subId            | remove         | physical subIds are internal; replacement behavior is the public contract      |
| Filter-mismatched EVENT is rejected                    | keep           | `query.spec.ts`: filter, verifier, and expiration pipeline                     |
| Forward/backward unsubscribe sends CLOSE               | keep           | `query.spec.ts` and `src/rx-nostr/relay-communication.test.ts`                 |
| EOSE sends an additional CLOSE                         | replace        | v4 treats EOSE as remote terminal and explicitly avoids redundant CLOSE        |
| Backward EOSE does not end later/older active segments | keep           | `src/rx-nostr/modules/req-backward.test.ts`: concurrent segments remain active |
| Backward `over()` completes after all segments         | keep           | `req-backward.test.ts` and `query.spec.ts`                                     |
| One-shot completes on EOSE                             | keep           | `query.spec.ts`: direct filters create a one-shot backward request             |
| Multiple relays can reach EOSE at different times      | keep           | `req-backward.test.ts`: dynamic/multi-relay segment completion                 |
| Dynamic relays affect live forward/backward work       | keep           | `req-forward.test.ts`, `req-backward.test.ts`, and `query.spec.ts`             |
| `max_subscriptions` queues overflowed REQs             | keep           | `query.spec.ts` and `relay-communication.test.ts`: FIFO physical queue         |
| CLOSED frees queue capacity                            | keep           | `relay-communication.test.ts`: relay-local terminal cleanup drains queued work |

## Reconnection and retry

| v3 scenario                                             | Classification | v4 coverage                                                                                                 |
| ------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| Unexpected drop resends an active forward REQ           | keep           | `src/rx-nostr/transport/nostr-transport.test.ts` and `relay-communication.test.ts`                          |
| Drop before backward EOSE resends REQ                   | keep           | `relay-communication.test.ts`: active physical query recovery                                               |
| Drop after backward EOSE does not resend                | keep           | remote-terminal cleanup removes the active query before recovery                                            |
| Close code 4000 always disables retry                   | remove         | v4 delegates unexpected-drop retry to `ConnectionRetryer`; no magic application close code is public policy |
| Retry `maxCount`                                        | replace        | `src/connection-retryer/exponential-backoff-retryer.test.ts`: `maxRetries` exhaustion                       |
| Lazy `since`/`until` is re-evaluated on resend          | keep           | `relay-communication.test.ts`                                                                               |
| Manual reconnect restores REQ                           | remove         | v4 exposes retry policy and connection demand, not the v3 manual reconnect API                              |
| Events attempted while manually disconnected are resent | replace        | `src/__test__/contract/publish.spec.ts`: an unconfirmed EVENT is resent after reconnect                     |

Tests assert the v4 logical-operation guarantee—active work is recovered or
terminated according to its configured retry policy—without fixing tests to
the old socket recreation algorithm.

## Publication

| v3 scenario                                              | Classification | v4 coverage                                                         |
| -------------------------------------------------------- | -------------- | ------------------------------------------------------------------- |
| Send only to writable default relays                     | remove         | v4 has no default-relay read/write flags; destinations are explicit |
| Relays added after send do not extend its completion set | keep           | `publish.spec.ts`: destination snapshot at call time                |
| Temporary relay option                                   | replace        | `publish.spec.ts`: per-publication `RelayInput` destinations        |
| `completeOn: "sent"`                                     | replace        | `waitFor("all"                                                      | "any")` settles only from final relay outcomes |

## Operators, RxReq, and verification

| v3 scenario                                           | Classification | v4 coverage                                                              |
| ----------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| `latestEach()`                                        | keep           | `src/operators/operators.test.ts`                                        |
| `filterByType()`                                      | keep           | `src/operators/operators.test.ts`                                        |
| `dropExpiredEvents()`                                 | keep           | `src/operators/operators.test.ts`                                        |
| `tie()` drops duplicate sightings and records origins | keep           | `src/operators/operators.test.ts`; the `isNew` result type is restored   |
| `RxReq.pipe()`                                        | keep           | `src/rx-req/rx-req.test.ts`                                              |
| configured verifier filters received events           | keep           | `query.spec.ts`: verification pipeline and callback error classification |

## Result

Every v3 test scenario is classified above. `keep` and `replace` entries have
v4 coverage, while removed behavior matches the public decisions and behavior
matrix. The operator scenarios were the only uncovered retained tests found by
the audit; they were added during Task 10.
