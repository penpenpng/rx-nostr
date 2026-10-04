# Test conventions

## Contract test organization

Group files in `specs/` by the public feature or contract they verify. Keep
lifecycle, cancellation, and recovery cases alongside the behavior they affect,
using `describe` blocks to organize each dimension within a file.

| File                        | Contract                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public-api.spec.ts`        | Runtime exports, public types and interfaces, and built-in defaults.                                                                                  |
| `facade.spec.ts`            | Configuration application and precedence, instance isolation, and RxNostr-wide disposal.                                                              |
| `query.spec.ts`             | Forward/backward inputs, event delivery and validation, source and subscription lifetime, destination changes, subscription limits, and REQ recovery. |
| `publish.spec.ts`           | Signed events, OK delivery, all/any settlement, publication cancellation, and EVENT resend after authentication or reconnection.                      |
| `auth.spec.ts`              | Authentication configuration, shared challenges, challenge replacement, AUTH outcomes, and authentication cancellation.                               |
| `connection-demand.spec.ts` | Connection demand shared by operations, hot relays, weak operations, prewarming, linger, and release of the last demand.                              |
| `connection-state.spec.ts`  | Public connection-state notifications and independence of observed state snapshots.                                                                   |
| `relay-directory.spec.ts`   | Relay metadata, snapshots, and NIP-11 fetching and caching.                                                                                           |
| `legacy.spec.ts`            | The v3 compatibility API.                                                                                                                             |

For scenarios involving several features, choose the file by the behavior the
test guarantees, rather than the APIs used to set up the scenario. For example:

- Destination removal cancelling a queued REQ belongs in `query.spec.ts`.
- A weak query not extending another operation's linger belongs in `connection-demand.spec.ts`.
- Shared AUTH surviving one query's cancellation belongs in `auth.spec.ts`.
- A publication remaining pending until authenticated resend belongs in `publish.spec.ts`.
- RxNostr disposal preventing delayed work belongs in `facade.spec.ts`.

Use `helper/protocol-scenario.ts` for scenarios needing controlled timers and
deferred protocol work. Its `scenarioTest` fixture disposes the clients, completes
socket close handshakes, and restores real timers after each test.

## Scenario conventions

- Contract test names use present-tense English verbs and describe an observable result. `describe` names identify the public API and one contract dimension.
- Keep one behavioral scenario per test. Split cases that need independent clients, causes, or terminal outcomes.
- Separate fixture setup, protocol actions, observations/assertions, and cleanup into meaningful paragraphs with a blank line between them.
- Use domain-specific scenario factories for repeated construction, while keeping protocol messages and assertions visible in the test body.
- Express asynchronous waits through named assertion helpers. Keep raw `vi.waitFor` inside those helpers when the condition has domain meaning.
- Use controlled sockets, deferred promises, and explicit acknowledgements instead of real network or wall-clock timing.
- Complete `dispose`, unsubscribe, and close handshakes explicitly in the test that created them.
