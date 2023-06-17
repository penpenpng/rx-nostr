import { expect, test } from "vitest";

import { createRxBackwardReq, extend, mixin } from "../index.js";

test("Extend req.", async () => {
  const addFoo = mixin<{ strategy: "backward" }, { foo: () => string }>(() => ({
    foo() {
      return this.strategy;
    },
  }));
  const req = extend(createRxBackwardReq(), addFoo);

  expect(req.strategy).toBe("backward");
  expect(req.foo()).toBe("backward");
});

test("Override req.", async () => {
  const original = extend(
    createRxBackwardReq(),
    mixin<object, { foo: () => string }>(() => ({
      foo() {
        return "foo";
      },
    }))
  );
  const override = mixin<{ foo: () => string }, { foo: () => number }>(() => ({
    foo() {
      return 100;
    },
  }));
  const req = extend(original, override);

  expect(req.foo()).toBe(100);
});
