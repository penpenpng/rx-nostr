export function once(f: () => void) {
  let done = false;

  return () => {
    if (done) {
      return;
    }

    done = true;
    f();
  };
}
