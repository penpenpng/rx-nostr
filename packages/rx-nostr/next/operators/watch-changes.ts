import {
  filter,
  from,
  map,
  merge,
  scan,
  type Observable,
  type ObservableInput,
  type ObservedValueOf,
} from "rxjs";

export function watchChanges<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  S extends Record<string, ObservableInput<any>>,
>(
  sources: S,
): Observable<[keyof S, { [K in keyof S]: ObservedValueOf<S[K]> }]> {
  return merge(
    ...Object.entries(sources).map(([key, value$]) =>
      from(value$).pipe(map((value) => ({ key, value }))),
    ),
  ).pipe(
    scan(
      ([, prevValues], updated): StagingState<S> => [
        updated.key,
        { ...prevValues, [updated.key]: updated.value },
      ],
      [null, {}] as StagingState<S>,
    ),
    filter(
      (
        output,
      ): output is [keyof S, { [K in keyof S]: ObservedValueOf<S[K]> }] => {
        const [key, values] = output;
        return key !== null && Object.keys(sources).every((k) => k in values);
      },
    ),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StagingState<S extends Record<string, ObservableInput<any>>> = [
  keyof S | null,
  Partial<S>,
];
