# Changesets

Create a changeset for every user-visible change:

```sh
pnpm changeset
```

Choose each affected package and the appropriate semantic-version bump. The
release workflow keeps a version PR open from these files. Merging that PR
publishes the packages and creates the corresponding GitHub releases.

The release command uses `changeset publish` to publish only unpublished package
versions and create their Git tags. Each public package builds through its
`prepack` script, so packing or publishing it also prepares its distribution files.
Keep `@changesets/cli` on v2 while the workflow uses `changesets/action@v1`.

Changes that only affect private documentation, tests, or repository tooling
do not require a changeset unless they alter a published contract.
