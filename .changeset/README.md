# Changesets

Create a changeset for every user-visible change:

```sh
pnpm changeset
```

Choose each affected package and the appropriate semantic-version bump. The
release workflow runs on `next` and keeps a version PR open from these files.
Merging that PR publishes the packages with the npm `beta` tag and creates the
corresponding GitHub prereleases. Versions follow `4.0.0-beta.0`,
`4.0.0-beta.1`, and so on.

The first v4 changeset includes a major bump for all three public packages so
their first beta versions match. After that, choose only the packages affected
by each change; versions are independent (`fixed` and `linked` are empty).
Prerelease state is tracked in `.changeset/pre.json`. Do not run `pre enter`
on every CI run or remove previously consumed changesets during the beta cycle.

Before the first version PR is merged, `release:beta` skips publication so the
stable version baselines, including the unpublished WASM placeholder, stay local.

The beta release command uses `changeset publish` with the `beta` tag from
`.changeset/pre.json` to publish only unpublished package versions and create their Git tags.
Each public package builds through its
`prepack` script, so packing or publishing it also prepares its distribution files.
Keep `@changesets/cli` on v2 while the workflow uses `changesets/action@v1`.

Changes that only affect private documentation, tests, or repository tooling
do not require a changeset unless they alter a published contract.
