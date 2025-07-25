import { afterEach } from "vitest";
import { setLogLevel } from "./next/logger.ts";

afterEach(() => {
  setLogLevel("warn");
});
