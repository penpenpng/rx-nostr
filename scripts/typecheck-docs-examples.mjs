import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = `
import { RxNostr } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";
const rxNostr = new RxNostr({ verifier: new SimpleVerifier() });
`;
const examples = {
  "root-readme-quickstart": { source: "README.md" },
  "package-readme-quickstart": { source: "packages/rx-nostr/README.md" },
  "v4-index": { source: "packages/docs/ja/v4/index.md" },
  "getting-started-client": { source: "packages/docs/ja/v4/getting-started.md" },
  "getting-started-query": {
    source: "packages/docs/ja/v4/getting-started.md",
    context: client,
  },
  "query-backward": {
    source: "packages/docs/ja/v4/query.md",
    context: `${client}\nconst pubkey = "0".repeat(64);\n`,
  },
  "publish-basic": { source: "packages/docs/ja/v4/publish.md", context: client },
  "auth-basic": { source: "packages/docs/ja/v4/auth.md" },
  "signer-interface": {
    source: "packages/docs/ja/v4/signer-verifier.md",
    context:
      'import type * as Nostr from "nostr-typedef";\nimport type { EventSigner as PublishedEventSigner } from "rx-nostr";\n',
    after: `
declare const documentedSigner: EventSigner;
declare const publishedSigner: PublishedEventSigner;
const publishedShape: PublishedEventSigner = documentedSigner;
const documentedShape: EventSigner = publishedSigner;
void [publishedShape, documentedShape];
`,
  },
  "verifier-interface": {
    source: "packages/docs/ja/v4/signer-verifier.md",
    context:
      'import type * as Nostr from "nostr-typedef";\nimport type { EventVerifier as PublishedEventVerifier } from "rx-nostr";\n',
    after: `
declare const documentedVerifier: EventVerifier;
declare const publishedVerifier: PublishedEventVerifier;
const publishedShape: PublishedEventVerifier = documentedVerifier;
const documentedShape: EventVerifier = publishedVerifier;
void [publishedShape, documentedShape];
`,
  },
  "signer-config": {
    source: "packages/docs/ja/v4/signer-verifier.md",
    context: `
import { RxNostr } from "rx-nostr";
import { SeckeySigner, SimpleVerifier } from "@rx-nostr/crypto";
const verifier = new SimpleVerifier();
const signer = new SeckeySigner("nsec1...");
const anotherSigner = signer;
const relays = ["wss://relay.example.com"];
const params = { kind: 1, content: "example", tags: [] as string[][] };
`,
  },
  "worker-host": { source: "packages/docs/ja/v4/signer-verifier.md", environment: "worker" },
  "worker-client": { source: "packages/docs/ja/v4/signer-verifier.md" },
};

function extract(source) {
  const lines = readFileSync(join(root, source), "utf8").split("\n");
  const found = [];

  for (let index = 0; index < lines.length; index++) {
    const match = /^<!-- typecheck-example: ([a-z0-9-]+) -->$/.exec(lines[index]);

    if (!match) {
      continue;
    }

    const key = match[1];
    const definition = examples[key];

    if (!definition || definition.source !== source) {
      throw new Error(`${source}:${index + 1}: unknown or misplaced typecheck marker ${key}`);
    }

    let fence = index + 1;

    while (lines[fence] === "") {
      fence++;
    }

    if (!/^```(?:ts|typescript)$/.test(lines[fence] ?? "")) {
      throw new Error(`${source}:${index + 1}: marker must precede a TypeScript code fence`);
    }

    const start = fence + 1;
    let end = start;

    while (end < lines.length && lines[end] !== "```") {
      end++;
    }

    if (end === lines.length) {
      throw new Error(`${source}:${start}: unclosed TypeScript code fence`);
    }

    found.push({ key, source, line: start + 1, code: lines.slice(start, end).join("\n") });

    index = end;
  }

  return found;
}

const cache = join(root, "node_modules/.cache");

mkdirSync(cache, { recursive: true });
const temp = mkdtempSync(join(cache, "rx-nostr-docs-examples-"));

try {
  const sources = new Set(Object.values(examples).map(({ source }) => source));
  const found = [...sources].flatMap(extract);
  const seen = new Set();

  for (const { key, source, line, code } of found) {
    if (seen.has(key)) {
      throw new Error(`${source}:${line}: duplicate typecheck marker ${key}`);
    }

    seen.add(key);
    writeFileSync(
      join(temp, `${key}.mts`),
      `${examples[key].context ?? ""}\n${code}\n${examples[key].after ?? ""}`,
    );
    console.log(`[docs example] ${key}.mts = ${source}:${line}`);
  }

  for (const key of Object.keys(examples)) {
    if (!seen.has(key)) {
      throw new Error(`Missing typecheck marker: ${key} in ${examples[key].source}`);
    }
  }

  for (const environment of ["browser", "worker"]) {
    const files = found
      .filter(({ key }) => (examples[key].environment ?? "browser") === environment)
      .map(({ key }) => `${key}.mts`);
    const config = join(temp, `tsconfig.${environment}.json`);

    writeFileSync(
      config,
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            lib: ["ESNext", environment === "worker" ? "WebWorker" : "DOM"],
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
          },
          files,
        },
        null,
        2,
      )}\n`,
    );

    console.log(`[docs example] TypeScript environment: ${environment}`);
    execFileSync("pnpm", ["exec", "tsc", "--project", config], {
      cwd: root,
      stdio: "inherit",
    });
  }

  console.log(`[docs example] ${found.length} published snippets typecheck`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
