import type { Observable } from "rxjs";

export interface IRetryController {
  createRetry(): Observable<void>;
}
