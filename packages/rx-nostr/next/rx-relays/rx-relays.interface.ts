import type { Observable, Subscribable } from "rxjs";

export interface IRxRelays extends Subscribable<Set<string>> {
  asObservable(): Observable<Set<string>>;
}
