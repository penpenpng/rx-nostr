# NIP-42 AUTH flow

This document defines the relay-connection AUTH lifecycle and how it coordinates
with ordinary protocol operations.

## Scope and configuration

- AUTH state belongs to one relay connection.
- Use the instance-level authenticator for every operation on that connection.
  Operation-level authenticators are not part of this contract.
- If no authenticator is configured, AUTH is disabled. A received challenge is
  retained for protocol state, but does not start an AUTH attempt. An operation
  rejected with `auth-required` fails because it cannot authenticate.

## Challenge lifecycle

- On receiving a relay `AUTH` challenge, store it and start AUTH immediately
  when an authenticator is configured.
- Start at most one AUTH attempt for a given challenge. Concurrent triggers
  share the same attempt and result.
- A new challenge creates a new challenge generation and starts one new attempt.
  Abort any pending attempt for the previous generation. Results from an older
  generation must not authenticate the new generation or release operations
  waiting for it.
- A reconnect discards the challenge and all AUTH state from the old
  connection.

## Sending while AUTH is in progress

- Before sending an ordinary protocol operation, wait for any AUTH attempt
  currently in progress on that connection. Apply this to new sends and
  retransmissions.
- AUTH messages bypass this wait. Otherwise AUTH would wait on itself.
- CLOSE and other messages needed to cancel or release resources also bypass
  this wait.
- A message already sent before the challenge arrived cannot be recalled. If
  its operation later receives `auth-required`, handle it as described below.
- On AUTH success, release waiting sends and mark the current challenge
  authenticated.
- On AUTH failure, release waiting sends and allow them to proceed without
  authentication. Some operations may not require AUTH.

## Handling `auth-required`

- When an EVENT or REQ receives `auth-required`, stop that attempt and mark the
  operation as waiting for authentication.
- If an AUTH attempt for the current challenge is in progress, wait for it. If
  it has not started and an authenticator and challenge are available, start it.
- If AUTH succeeds, retransmit the operation once. Keep its normal response
  handling active for the retransmission.
- If the retransmission also receives `auth-required`, fail the operation. Do
  not create an AUTH/retransmission loop.
- If AUTH for the current challenge has already failed, fail this operation
  without another AUTH attempt.
- If there is no challenge or authenticator, fail the operation without
  retransmitting it.
- An AUTH failure is scoped to its challenge. A new challenge permits one new
  AUTH attempt; the previous failure does not block operations that do not need
  authentication.
- Cancellation removes an operation from the AUTH wait and retry queue. A
  canceled operation must not be retransmitted later.

## State model

Track AUTH status per challenge generation:

| State | Meaning | Effect on `auth-required` |
| --- | --- | --- |
| `unstarted` | Challenge is known; AUTH has not started | Start AUTH, then wait |
| `pending` | AUTH is in progress | Join the attempt and wait |
| `authenticated` | AUTH succeeded | Retransmit the operation once |
| `failed` | AUTH was rejected or failed | Fail the operation without retrying AUTH |

The state is reset to `unstarted` when a new challenge arrives and discarded
when the connection ends.

## Required race coverage

- AUTH success arrives before an operation's `auth-required` response.
- `auth-required` arrives while proactive AUTH is pending.
- Several operations wait on one AUTH attempt and are each retransmitted once
  after success.
- AUTH failure releases unrelated sends; later `auth-required` operations fail
  without repeating AUTH for the same challenge.
- A new challenge starts a new attempt after a previous attempt failed.
- Cancellation while waiting prevents later retransmission.
- A stale AUTH result after a new challenge or reconnect does not release or
  retry work for the newer connection state.
