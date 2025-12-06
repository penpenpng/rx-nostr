let _logLevel: LogLevel = "warn";

type LogLevel = "debug" | "warn" | "error" | "silent";

export function setLogLevel(logLevel: LogLevel) {
  _logLevel = logLevel;
}

function logLevel() {
  switch (_logLevel) {
    case "debug":
      return 0;
    case "warn":
      return 1;
    case "error":
      return 2;
    case "silent":
      return 3;
  }
}

function debug(...args: unknown[]) {
  if (logLevel() <= 0) {
    console.debug("[rx-nostr]", ...args);
  }
}
function warn(...args: unknown[]) {
  if (logLevel() <= 1) {
    console.warn("[rx-nostr]", ...args);
  }
}
function error(...args: unknown[]) {
  if (logLevel() <= 2) {
    console.error("[rx-nostr]", ...args);
  }
}

export class Logger {
  static trace(traceTag: unknown, ...args: unknown[]) {
    debug(`[:${traceTag}]`, ...args);
  }
  static debug = debug;
  static warn = warn;
  static error = error;
}
