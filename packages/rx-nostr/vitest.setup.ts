import { afterEach } from "vitest";
import { setLogLevel } from "./src/logger.ts";

afterEach(() => {
  setLogLevel("warn");
});
