# rx-nostr

## 4.0.0-beta.1

### Major Changes

- 32e6893: Replace RxRelays.get() with toArray() and rename its set() mutation to replace(). Move static URL conversions to the internal RelayUrls utility. Return ReadonlyRxRelays from set operations, from(), and empty(), and accept readonly relay collections throughout relay inputs.

### Minor Changes

- 9a01af7: Allow a single LazyFilter as the request input to forward and backward.

## 4.0.0-beta.0

### Major Changes

- 3fcfd85: Release the redesigned v4 API and matching crypto backends as 4.0.0-beta.0.
  The first beta aligns all three packages; subsequent beta releases version
  only the packages affected by each changeset.
