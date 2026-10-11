import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pre = JSON.parse(readFileSync(join(root, ".changeset/pre.json"), "utf8"));

if (pre.mode !== "pre" || pre.tag !== "beta") {
  throw new Error("Beta publishing requires Changesets prerelease mode with the beta tag.");
}

// Before the first version PR is merged, next still contains stable baselines.
// In particular, the unpublished WASM baseline must not be published as 3.0.0.
if (pre.changesets.length === 0) {
  console.log("No beta version PR has been merged yet; skipping publication.");
} else {
  for (const directory of readdirSync(join(root, "packages"))) {
    const manifest = join(root, "packages", directory, "package.json");

    if (!existsSync(manifest)) {
      continue;
    }

    const pkg = JSON.parse(readFileSync(manifest, "utf8"));

    if (!pkg.private && !/^4\.0\.0-beta\.\d+$/.test(pkg.version)) {
      throw new Error(`Refusing to publish ${pkg.name}@${pkg.version}: expected 4.0.0-beta.N.`);
    }
  }

  // Changesets reads the dist tag from pre.json; --tag is rejected in pre mode.
  const result = spawnSync("pnpm", ["exec", "changeset", "publish"], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}
