import { RxNostrLogicError } from "../error.js";
import { EMPTY, Empty } from "./empty.js";
import type { OptionalPart, RequiredPart } from "./types.js";

export type FilledConfig<C, D> = RequiredPart<C> & {
  [K in keyof OptionalPart<C>]: K extends keyof D ? NonNullable<C[K]> : C[K];
};

export const config = <C>() => ({
  default: <const D extends Partial<OptionalPart<C>>>(factory: () => D) => {
    const defaults = factory();
    let inputs: C | Empty = EMPTY;

    return {
      set(config: C) {
        inputs = config;
      },
      get<const K extends keyof FilledConfig<C, D>>(
        key: K,
      ): FilledConfig<C, D>[K] {
        if (inputs === EMPTY) {
          throw new RxNostrLogicError();
        }

        return (inputs[key] ?? defaults[key]) as FilledConfig<C, D>[K];
      },
    };
  },
});

export const fill = <
  C,
  const D extends Partial<OptionalPart<C>> = Partial<OptionalPart<C>>,
>(
  config: C,
  defaults: D,
): FilledConfig<C, D> =>
  ({
    ...defaults,
    ...config,
  }) as FilledConfig<C, D>;
