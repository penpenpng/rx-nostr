---
"rx-nostr": major
"@rx-nostr/crypto": major
"@rx-nostr/crypto-wasm": major
---

Close backward subscriptions after EOSE before reusing relay capacity. Remove signer constructor tags options; event tags must be provided before signing. Restrict v4 relay inputs to URLs, arrays, Sets, and RxRelays. Move the NIP-11 timeout to RelayDirectory construction so shared fetches use one deadline.

Reject RxRelays mutations after disposal, prevent disposed VerificationHost instances from restarting or replying to pending work, and reject NIP-07 public-key failures through promises. Standardize public error names and native cause handling, including RxNostrRelayDirectorySnapshotError. Keep ordinary operator instances local to each pipe and align setDiff state with that contract. Update documentation and regression scenarios.
