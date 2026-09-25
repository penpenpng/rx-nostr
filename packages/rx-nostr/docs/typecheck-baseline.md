# Task 00 typecheck baseline

## Snapshot

- Date: 2026-09-21
- Base commit: `6821d47`
- Scope: v4 production code and tests under `packages/rx-nostr/next`
- Command: `npm run typecheck -w packages/rx-nostr`
- Result: exit code 2, 38 diagnostics in 11 files

This is an intentional failing baseline, not a list of accepted errors. `tsconfig.check.json` includes v4 tests so that their type drift is visible. The production declaration configuration excludes tests and reports 37 diagnostics. Neither configuration includes the incomplete v3 `src`; no baseline diagnostic originates there.

## Diagnostic ownership

| Area / file                                       | Count | Cause at this snapshot                                                                    | Owning task |
| ------------------------------------------------- | ----: | ----------------------------------------------------------------------------------------- | ----------- |
| `next/__test__/helper/faker.ts`                   |     1 | `EventPacket` fixture still assumes the provisional public `subId` shape                  | 01          |
| `next/operators/req-packet/batch.ts`              |     1 | relay input and operator key types disagree                                               | 01          |
| `next/relay-directory/{relay-directory,relay}.ts` |     2 | placeholder parameters are unused                                                         | 04          |
| `next/rx-nostr/modules/publish.ts`                |     2 | progress/timeout union is inconsistent and `summarize` is missing                         | 08          |
| `next/rx-nostr/modules/relay-warmer.ts`           |     3 | provisional warmer calls missing connection lease methods                                 | 03          |
| `next/rx-nostr/relay-communication.ts`            |     9 | unfinished direct-socket implementation and missing return paths                          | 02          |
| `next/rx-nostr/rx-nostr.legacy.ts`                |    10 | incomplete v3 compatibility surface; D1 requires removing it instead of repairing aliases | 01          |
| `next/rx-nostr/rx-nostr.ts`                       |     1 | connection-state facade is a placeholder                                                  | 09          |
| `next/rx-nostr/websocket.ts`                      |     8 | unfinished direct WebSocket implementation                                                | 02          |
| `next/rx-req/rx-req.ts`                           |     1 | stale `traceId`; the public correlation field is `traceTag`                               | 01          |

Each owning task must remove its diagnostics through the intended contract or implementation. Dummy returns, broad casts, and disabling diagnostics do not satisfy that task.

## Build failure propagation

The two supported build paths now reject this baseline:

- `npm run build -w packages/rx-nostr`: exit code 2 at the independent typecheck gate.
- direct `vite build` in `packages/rx-nostr`: exit code 1; declaration generation throws after reporting 37 production diagnostics.

This prevents the previous behavior where declaration diagnostics were printed while the build exited successfully.

## Direct WebSocket removal inventory

Task 02 must remove production WebSocket ownership from rx-nostr and route transport through unipls. The concrete remnants are:

- `next/websocket.ts`: public-looking structural WebSocket interfaces.
- `next/rx-nostr/websocket.ts`: direct socket construction, event handling, protocol parsing, and close-code definitions.
- `next/rx-nostr/relay-communication.ts`: direct `NostrWebsocket` ownership.
- `next/rx-nostr/rx-nostr.config.ts` and `rx-nostr.interface.ts`: provisional constructor plumbing. The capability may remain in an rx-nostr-owned config type, but no unipls type may enter the public API.

WebSocket wording in packet comments and error names is not itself direct transport access, but Task 01/02 should review whether those public concepts still describe the v4 abstraction accurately.

## Controlled transport policy

rx-nostr tests must not deep-import `packages/unipls/tests/support`. That directory is not an exported unipls contract. Task 02 will either add an rx-nostr-owned, protocol-level controlled fixture or propose a public unipls test-support export. The latter requires consulting the user before changing unipls.

## Runtime note

The compiler emits ES2022 and uses `ESNext` library declarations because current code calls the new Set methods (`difference`, `intersection`, `symmetricDifference`, and `union`). The adopted unipls floor is Node >= 22.4, Deno >= 2, Bun >= 1.2, and the latest two major browser versions. A smoke check passed on Node 24.14.1 at this snapshot.

Task 12 must exercise these Set calls in every supported runtime lane. If any minimum runtime in the adopted matrix lacks them, replace the calls with internal helpers rather than raising the runtime floor silently.

## Progress after Task 01

Task 01 removed all diagnostics assigned to its public-model scope, including the legacy placeholder, `traceId`, fixture packet, and relay-input/operator errors. The 2026-09-21 check now reports 34 diagnostics in seven files:

- Task 02: `relay-communication.ts` and the direct `rx-nostr/websocket.ts` (25)
- Task 03: `modules/relay-warmer.ts` (3)
- Task 04: RelayDirectory placeholders (2)
- Task 08: publication implementation and its facade return (3)
- Task 09: connection-state facade placeholder (1)

No diagnostic comes from the public contract spec, public config model, v3 `src`, or a Task 01-owned file.

## Progress after Task 02

Task 02 removed all diagnostics in `relay-communication.ts`, `rx-nostr/websocket.ts`, and the provisional `RelayWarmer` integration. The direct socket file no longer exists. The 2026-09-21 check now reports 6 diagnostics in four files:

- Task 04: RelayDirectory placeholders (2)
- Task 08: publication implementation and its facade return (3)
- Task 09: connection-state facade placeholder (1)

No diagnostic comes from the Nostr codec, unipls adapter, reconnect policy, controlled transport tests, or public contract spec.

## Progress after Task 03

Task 03 replaced the provisional generic relay map with the per-instance `RelayCommunicationCollection` and connected query/hot lifetime to one lease contract without introducing new diagnostics. The check still reports the same 6 diagnostics owned by Tasks 04, 08, and 09. No diagnostic comes from collection, lease, warmer, connection-demand-scope, or their tests.

## Progress after Task 04

Task 04 replaced the RelayDirectory placeholders and removed both diagnostics in that area. The 2026-09-21 check now reports 4 diagnostics in two files:

- Task 08: publication implementation and its facade return (3)
- Task 09: connection-state facade placeholder (1)

No diagnostic comes from RelayDirectory, its snapshot and NIP-11 implementation, public config, or their tests.

## Progress after Task 05

Task 05 implemented `monitorConnectionState()` while wiring the unipls lifecycle to rx-nostr state and RelayDirectory health. This also removed the diagnostic previously assigned to Task 09's connection-state facade. The 2026-09-21 check now reports only 3 diagnostics, all owned by Task 08:

- publication progress/timeout type mismatch
- missing publication `summarize` implementation
- facade return type does not yet implement `Publication`

No diagnostic comes from lifecycle mapping, retry policy integration, RelayDirectory reporting, relay collection observation, or connection-state contract tests.

## Progress after Task 06

Task 06 connected the public REQ facade to the REQ engine, including lazy filter resend, filter verification, relay-local finalization, NIP-11 queueing, and automatic metadata fetch. The 2026-09-21 check still reports only the same 3 diagnostics owned by Task 08:

- publication progress/timeout type mismatch
- missing publication `summarize` implementation
- facade return type does not yet implement `Publication`

No diagnostic comes from query scheduling, forward/backward orchestration, Nostr transport query factories, callback error mapping, or their public contract tests.

## Progress after Task 07

Task 07 added the relay-local AUTH coordinator, typed kind 22242 authenticator contract, challenge generation isolation, shared authentication, and one-shot REQ/EVENT replay without introducing diagnostics. The 2026-09-21 check still reports only the same 3 diagnostics owned by Task 08:

- publication progress/timeout type mismatch
- missing publication `summarize` implementation
- facade return type does not yet implement `Publication`

No diagnostic comes from AUTH configuration, coordinator cancellation/deduplication, transport AbortSignal wiring, or the AUTH public contract tests.

## Progress after Task 08

Task 08 replaced the provisional progress Observable with the decided hot `Publication` object and removed all remaining baseline diagnostics. On 2026-09-21, `npm run typecheck -w packages/rx-nostr` exits 0, and `npm run build -w packages/rx-nostr` completes JavaScript and declaration generation successfully.

All 38 diagnostics recorded at Task 00 have now been removed through their owning implementation tasks. Task 10 completed the source/workspace/dependency/release-tooling migration, and Task 11 completed the TypeScript 6 and Vite+ static quality gates. Task 12 owns package artifact inspection and cross-runtime release tests; zero diagnostics alone does not complete that audit.
