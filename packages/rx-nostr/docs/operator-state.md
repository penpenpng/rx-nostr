# Operator state ownership review

The public usage contract is to construct ordinary operators separately inside
each `pipe()`. Reusing an operator instance across streams, or expecting fresh
state when resubscribing to a saved pipeline, is not supported as a general
contract. The `createUniq` and `createTie` factories explicitly expose shared
state for callers to manage.

The release audit's proposal to recreate every buffer per subscription was not
adopted. The following implementations were inspected:

| Implementation                                                | State owner                                                        | Decision                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `sort`, `sortEvents`                                          | Factory invocation owns the buffer                                 | Retain; callers create separate instances                                                                 |
| `tie`, `createTie`, `createUniq`                              | Factory invocation owns memo/cache                                 | Retain; create factories permit explicit sharing                                                          |
| `setDiff`                                                     | Previously an extra `defer` recreated state per subscription       | Remove the extra isolation and retain the snapshot state in the factory closure                           |
| `dropExpiredEvents`, internal `mapStored`                     | Factory invocation owns reference time/store                       | Retain                                                                                                    |
| `uniq`                                                        | RxJS `distinct` owns subscription state                            | Retain the native RxJS operator; this does not establish an instance-reuse guarantee for other operators  |
| `latest`, `timeline`, `withPrevious`, internal `watchChanges` | RxJS `scan` / `distinctUntilChanged` state                         | Retain; no custom buffer reconstruction wrapper                                                           |
| `latestEach`                                                  | RxJS `groupBy` creates per-key streams                             | Retain the grouping semantics                                                                             |
| `filterAsync`, `verify`                                       | RxJS `mergeMap` owns pending inner subscriptions                   | Retain; cancellation and completion must follow the subscribing stream                                    |
| `finalizeWithLast`                                            | Subscribe callback tracks the value associated with its completion | Retain; this is completion bookkeeping, not isolation of a reusable cache; callback remains complete-only |
| internal `tapOnce`                                            | Subscribe callback tracks execution for that subscription          | Retain its lifecycle semantics; it is not a public cache-bearing operator                                 |
| Other filters, `batch`, `chunk`, `timeoutWith`                | Stateless, per-input, or delegated RxJS state                      | No buffer-isolation wrapper found                                                                         |

Tests now construct separate ordinary operators instead of advertising cross-stream
instance reuse as a public guarantee. Input and output snapshot protections remain
in place; these are distinct from the lifetime of operator state.
