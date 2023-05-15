import { firstValueFrom, Observable, toArray } from "rxjs";

export function asArray<T>(val$: Observable<T>): Promise<T[]> {
  return firstValueFrom(val$.pipe(toArray()));
}
