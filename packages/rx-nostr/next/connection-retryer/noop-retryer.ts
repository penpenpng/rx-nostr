import { EMPTY } from "rxjs";
import type { ConnectionRetryer } from "./connection-retryer.interface.ts";

export class NoopRetryer implements ConnectionRetryer {
  createRetry() {
    return EMPTY;
  }
}
