export function setTimeout(ms, value, { signal } = {}) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve(value);
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
