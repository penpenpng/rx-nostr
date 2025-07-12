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

export class Logger {
  static debug(...args: unknown[]) {
    if (logLevel() <= 0) {
      console.debug("[rx-nostr]", ...args);
    }
  }
  static warn(...args: unknown[]) {
    if (logLevel() <= 1) {
      console.warn("[rx-nostr]", ...args);
    }
  }
  static error(...args: unknown[]) {
    if (logLevel() <= 2) {
      console.error("[rx-nostr]", ...args);
    }
  }
}
