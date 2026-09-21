# Changesets

Create a changeset for every user-visible change:

```sh
pnpm changeset
```

Choose each affected package and the appropriate semantic-version bump. The
release workflow keeps a version PR open from these files. Merging that PR
publishes the packages and creates the corresponding GitHub releases.

Changes that only affect private documentation, tests, or repository tooling
do not require a changeset unless they alter a published contract.
