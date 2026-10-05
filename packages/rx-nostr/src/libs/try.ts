export function tryOrDefault<T, U>(f: () => T, g: U | ((err: unknown) => U)): T | U {
  try {
    return f();
  } catch (err) {
    if (typeof g === "function") {
      return g(err);
    } else {
      return g;
    }
  }
}

export function raise(err: Error): never {
  throw err;
}
