export function only(f: () => void) {
  let done = false;

  return () => {
    if (done) {
      return;
    }

    done = true;
    f();
  };
}
