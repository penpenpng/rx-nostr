import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const signedEvent = JSON.parse(
  await readFile(join(root, "packages", "test-fixtures", "signed-event.json"), "utf8"),
);
const temp = await mkdtemp(join(root, "node_modules", ".worker-browser-"));
const source = join(temp, "source");
const output = join(temp, "output");
let server;
let browser;

async function browserPort(profile) {
  const path = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      return Number((await readFile(path, "utf8")).split("\n")[0]);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error("Chrome did not open its debugging port.");
}

async function evaluatePage(port, url) {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find((candidate) => candidate.type === "page");

  if (!tab) {
    throw new Error("Chrome did not create a page.");
  }

  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  let loaded;
  const load = new Promise((resolve) => {
    loaded = resolve;
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.method === "Page.loadEventFired") {
      loaded();
    }
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;

      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  try {
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Page.navigate", { url });
    await load;
    const result = await call("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        const finish = () => {
          if (document.body.dataset.result !== "pending") {
            observer.disconnect();
            clearTimeout(timer);
            resolve({ result: document.body.dataset.result, message: document.body.textContent });
          }
        };
        const observer = new MutationObserver(finish);
        const timer = setTimeout(() => resolve({ result: "timeout" }), 10000);
        observer.observe(document.body, { attributes: true, childList: true });
        finish();
      })`,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.error || result.result?.exceptionDetails) {
      throw new Error(`Chrome evaluation failed: ${JSON.stringify(result)}`);
    }

    return result.result.result.value;
  } finally {
    socket.close();
  }
}

try {
  await mkdir(source);
  await writeFile(
    join(source, "index.html"),
    '<html><body data-result="pending"></body><script type="module" src="/page.ts"></script></html>',
  );
  await writeFile(
    join(source, "worker.ts"),
    `import { VerificationHost } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";
const host = new VerificationHost(new SimpleVerifier());
host.start();
self.addEventListener("message", (event) => {
  if (event.data === "stop") {
    host.dispose();
    self.postMessage("stopped");
  }
});
`,
  );
  await writeFile(
    join(source, "page.ts"),
    `import { VerificationClient } from "rx-nostr";
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const client = new VerificationClient({ worker, timeout: 5000 });
const waitFor = (expected) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timed out waiting for " + expected)), 5000);
  worker.addEventListener("message", function onMessage(event) {
    if (event.data !== expected) return;
    clearTimeout(timer);
    worker.removeEventListener("message", onMessage);
    resolve();
  });
});
try {
  client.start();
  const ready = waitFor("pong");
  await ready;
  if (client.status !== "active") throw new Error("Client did not become active: " + client.status);
  const event = ${JSON.stringify(signedEvent)};
  if (await client.verifyEvent(event) !== true) throw new Error("Expected true");
  if (await client.verifyEvent({ ...event, content: "invalid" }) !== false) throw new Error("Expected false");
  const stopped = waitFor("stopped");
  worker.postMessage("stop");
  await stopped;
  client.dispose();
  document.body.dataset.result = "ok";
} catch (error) {
  client.dispose();
  document.body.dataset.result = "error";
  document.body.textContent = String(error);
}
`,
  );

  await build({
    configFile: false,
    root: source,
    logLevel: "error",
    build: { outDir: output, emptyOutDir: true, target: "es2022" },
  });

  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = resolve(output, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);

      if (!path.startsWith(`${output}/`) && path !== join(output, "index.html")) {
        response.writeHead(403).end();

        return;
      }

      const content = await readFile(path);
      const type = extname(path) === ".js" ? "application/javascript" : "text/html";

      response.writeHead(200, { "content-type": type }).end(content);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const chrome = process.env.CHROME_BIN ?? "google-chrome";
  const profile = join(temp, "chrome-profile");

  browser = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const port = await browserPort(profile);
  const result = await evaluatePage(port, `http://127.0.0.1:${address.port}/`);

  if (result.result !== "ok") {
    throw new Error(`Worker browser smoke failed: ${JSON.stringify(result)}`);
  }

  console.log(
    "Module Worker imported rx-nostr, exchanged verification messages, and disposed in Chrome.",
  );
} finally {
  if (browser && browser.exitCode === null) {
    const closed = new Promise((resolve) => browser.once("close", resolve));

    browser.kill();
    await closed;
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
