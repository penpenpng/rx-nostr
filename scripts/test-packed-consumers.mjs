import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "rx-nostr-packed-"));
const packDir = join(temp, "tarballs");
const consumerDir = join(temp, "consumer");
const packages = [
  { name: "rx-nostr", directory: "rx-nostr", entries: ["index", "operators", "utils", "legacy"] },
  { name: "@rx-nostr/crypto", directory: "crypto", entries: ["index"] },
  { name: "@rx-nostr/crypto-wasm", directory: "crypto-wasm", entries: ["index"] },
];

function run(command, args, cwd, label, quiet = false) {
  console.log(`\n[packed consumer] ${label}`);
  try {
    execFileSync(command, args, { cwd, stdio: quiet ? "pipe" : "inherit" });
  } catch (error) {
    if (quiet) {
      if (error.stdout) {
        process.stderr.write(error.stdout);
      }
      if (error.stderr) {
        process.stderr.write(error.stderr);
      }
    }

    throw error;
  }
}

function inspectTarball(pkg, tarball) {
  const files = new Set(
    execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n"),
  );
  const required = ["package/package.json", "package/README.md"];

  for (const entry of pkg.entries) {
    required.push(`package/dist/${entry}.d.ts`);

    if (pkg.directory !== "crypto-wasm") {
      required.push(`package/dist/${entry}.js`);
    }
  }

  if (pkg.directory === "crypto-wasm") {
    required.push("package/dist/rx-nostr-crypto-wasm.js");
  }

  for (const path of required) {
    if (!files.has(path)) {
      throw new Error(`${pkg.name}: tarball is missing ${path}`);
    }
  }

  for (const path of files) {
    if (
      /(?:^|\/)(?:__test__|__tests__|test|tests|__fixtures__|helpers)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/.test(
        path,
      )
    ) {
      throw new Error(`${pkg.name}: test/helper file leaked into tarball: ${path}`);
    }
  }

  console.log(`[packed consumer] ${pkg.name}: ${files.size} files checked`);
}

try {
  mkdirSync(packDir);
  mkdirSync(consumerDir);
  const tarballs = new Map();

  for (const pkg of packages) {
    const packageDir = join(root, "packages", pkg.directory);
    const before = new Set(readdirSync(packDir));

    run("pnpm", ["pack", "--pack-destination", packDir], packageDir, `pack ${pkg.name}`, true);
    const created = readdirSync(packDir).filter(
      (file) => file.endsWith(".tgz") && !before.has(file),
    );

    if (created.length !== 1) {
      throw new Error(`${pkg.name}: expected one tarball; found ${created.join(", ")}`);
    }

    const tarball = join(packDir, created[0]);

    inspectTarball(pkg, tarball);
    tarballs.set(pkg.name, tarball);
  }

  const typescriptVersion = JSON.parse(
    readFileSync(join(root, "node_modules/typescript/package.json"), "utf8"),
  ).version;
  const dependencies = Object.fromEntries(
    [...tarballs].map(([name, tarball]) => [name, `file:${tarball}`]),
  );

  Object.assign(dependencies, {
    disposablestack: "^1.1.8",
    "nostr-typedef": "^0.13.0",
    rxjs: "^7.8.2",
    typescript: typescriptVersion,
  });
  writeFileSync(
    join(consumerDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module", dependencies }, null, 2)}\n`,
  );

  for (const file of [
    "consumer.mts",
    "smoke.mjs",
    "tsconfig.nodenext.json",
    "tsconfig.bundler.json",
  ]) {
    copyFileSync(join(root, "scripts/packed-consumer", file), join(consumerDir, basename(file)));
  }

  copyFileSync(
    join(root, "packages/test-fixtures/signed-event.json"),
    join(consumerDir, "signed-event.json"),
  );

  run(
    "pnpm",
    ["install", "--no-frozen-lockfile", "--ignore-scripts"],
    consumerDir,
    "clean install from tarballs",
  );
  const runtimeBins = [
    ...new Set([process.execPath, process.env.CONSUMER_NODE_BIN].filter(Boolean)),
  ];

  for (const runtime of runtimeBins) {
    const version = execFileSync(runtime, ["--version"], { encoding: "utf8" }).trim();

    run(
      runtime,
      ["smoke.mjs"],
      consumerDir,
      `${version} ESM runtime: root, operators, utils, legacy, crypto, crypto-wasm`,
    );

    const missingNative = spawnSync(
      runtime,
      ["--input-type=module", "-e", "delete globalThis.DisposableStack; await import('rx-nostr')"],
      { cwd: consumerDir, encoding: "utf8" },
    );

    if (missingNative.status === 0 || !`${missingNative.stderr}`.includes("DisposableStack")) {
      throw new Error(
        `${version}: missing native DisposableStack was not detected: ${missingNative.stderr}`,
      );
    }

    run(
      runtime,
      [
        "--input-type=module",
        "-e",
        "delete globalThis.DisposableStack; await import('disposablestack/auto'); const { RxNostr } = await import('rx-nostr'); new RxNostr().dispose()",
      ],
      consumerDir,
      `${version} documented polyfill must load before packed ESM import`,
    );
  }

  for (const resolution of ["nodenext", "bundler"]) {
    run(
      "pnpm",
      ["exec", "tsc", "--project", `tsconfig.${resolution}.json`],
      consumerDir,
      `strict types: ${resolution}`,
    );
  }

  const wasmManifestPath = join(consumerDir, "node_modules/@rx-nostr/crypto-wasm/package.json");
  const wasmManifestText = readFileSync(wasmManifestPath, "utf8");

  try {
    const wasmManifest = JSON.parse(wasmManifestText);

    delete wasmManifest.exports["."].types;
    writeFileSync(wasmManifestPath, `${JSON.stringify(wasmManifest, null, 2)}\n`);

    for (const resolution of ["nodenext", "bundler"]) {
      console.log(`[packed consumer] missing WASM types must fail: ${resolution}`);
      const result = spawnSync(
        "pnpm",
        ["exec", "tsc", "--project", `tsconfig.${resolution}.json`],
        { cwd: consumerDir, encoding: "utf8" },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

      if (result.status === 0 || !output.includes("@rx-nostr/crypto-wasm")) {
        throw new Error(`Missing WASM types were not detected by ${resolution}: ${output}`);
      }
    }
  } finally {
    writeFileSync(wasmManifestPath, wasmManifestText);
  }

  console.log("\n[packed consumer] all checks passed");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
