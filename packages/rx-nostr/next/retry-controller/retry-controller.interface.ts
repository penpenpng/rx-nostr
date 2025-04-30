import type { Observable } from "rxjs";

export interface RetryController {
  createRetry(): Observable<void>;
}
