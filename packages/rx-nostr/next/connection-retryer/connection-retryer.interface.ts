import type { Observable } from "rxjs";

export interface ConnectionRetryer {
  createRetry(): Observable<void>;
}
