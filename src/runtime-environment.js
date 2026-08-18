export function isTauriRuntime(locationLike = globalThis.location, globalLike = globalThis) {
  return Boolean(
    globalLike?.isTauri
      || globalLike?.__TAURI_INTERNALS__
      || locationLike?.protocol === "tauri:"
      || locationLike?.hostname === "tauri.localhost"
  );
}

export function apiBaseForRuntime(locationLike = globalThis.location, globalLike = globalThis) {
  return isTauriRuntime(locationLike, globalLike) ? "http://127.0.0.1:4320" : "";
}
