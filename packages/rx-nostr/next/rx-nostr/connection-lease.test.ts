import { describe, expect, test, vi } from "vitest";
import { ConnectionLeaseController } from "./connection-lease.ts";

const setup = () => {
  const handlers = {
    onFirstLease: vi.fn(),
    onLastRelease: vi.fn(),
    onDispose: vi.fn(),
  };
  return { controller: new ConnectionLeaseController(handlers), handlers };
};

describe("ConnectionLeaseController", () => {
  test("opens on 0 -> 1 and closes on 1 -> 0", async () => {
    const { controller, handlers } = setup();
    const first = controller.hold();
    const second = controller.hold();

    expect(controller.count).toBe(2);
    expect(handlers.onFirstLease).toHaveBeenCalledOnce();
    first();
    expect(handlers.onLastRelease).not.toHaveBeenCalled();
    second();
    await Promise.resolve();

    expect(controller.count).toBe(0);
    expect(handlers.onLastRelease).toHaveBeenCalledOnce();
  });

  test("lease disposer is idempotent", async () => {
    const { controller, handlers } = setup();
    const release = controller.hold();
    release();
    release();
    await Promise.resolve();

    expect(controller.count).toBe(0);
    expect(handlers.onLastRelease).toHaveBeenCalledOnce();
  });

  test("a same-turn reacquire cancels stale close without reopening", async () => {
    const { controller, handlers } = setup();
    const releaseFirst = controller.hold();
    releaseFirst();
    const releaseSecond = controller.hold();
    await Promise.resolve();

    expect(handlers.onFirstLease).toHaveBeenCalledOnce();
    expect(handlers.onLastRelease).not.toHaveBeenCalled();

    releaseSecond();
    await Promise.resolve();
    expect(handlers.onLastRelease).toHaveBeenCalledOnce();
  });

  test("dispose invalidates queued close and later lease releases", async () => {
    const { controller, handlers } = setup();
    const release = controller.hold();
    release();
    controller.dispose();
    release();
    await Promise.resolve();

    expect(controller.count).toBe(0);
    expect(handlers.onLastRelease).not.toHaveBeenCalled();
    expect(handlers.onDispose).toHaveBeenCalledOnce();
    expect(controller.hold()).toBeTypeOf("function");
    expect(controller.count).toBe(0);
  });
});
