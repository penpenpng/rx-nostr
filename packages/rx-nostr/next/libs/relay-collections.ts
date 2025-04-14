import { Subject } from "rxjs";
import { inlineTry } from "./error.ts";
import { once } from "./once.ts";

export function normalizeRelayUrl(url: string): string | null {
  if (typeof url !== "string") {
    return null;
  }
  if (URL.canParse && !URL.canParse(url)) {
    return null;
  }

  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }

  u.hash = "";
  u.pathname = inlineTry(() => decodeURI(u.pathname), u.pathname);
  u.pathname = u.pathname.replace(/\/$/, "");
  u.hostname = u.hostname.replace(/\.$/, "");
  u.searchParams.sort();
  u.search = inlineTry(() => decodeURIComponent(u.search), u.search);

  if (!/^wss?:$/.test(u.protocol)) {
    return null;
  }
  if (!u.hostname) {
    return null;
  }

  let s = u.toString();
  if (!u.search) {
    s = s.replace(/\/$/, "");
  }

  return s;
}

export class RelayMap<T> extends Map<string, T> {
  constructor(obj?: Record<string, T>, options?: { trusted?: boolean }) {
    super();

    if (!obj) {
      return;
    }

    for (const [url, v] of Object.entries(obj)) {
      if (options?.trusted) {
        super.set(url, v);
      } else {
        this.set(url, v);
      }
    }
  }
  get(url: string) {
    const u = normalizeRelayUrl(url);
    if (u === null) {
      return undefined;
    }

    return super.get(u);
  }
  getMany(urls: string[]) {
    const vs: T[] = [];

    for (const url of new Set(urls.map(normalizeRelayUrl))) {
      if (url === null) {
        continue;
      }

      if (this.has(url)) {
        vs.push(this.get(url)!);
      }
    }

    return vs;
  }
  set(url: string, v: T) {
    const u = normalizeRelayUrl(url);
    if (u === null) {
      return this;
    }

    return super.set(u, v);
  }
  has(url: string): boolean {
    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return super.has(u);
  }
  delete(url: string) {
    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return super.delete(u);
  }
  toObject(): Record<string, T> {
    const obj: Record<string, T> = {};

    for (const [url, v] of this.entries()) {
      obj[url] = v;
    }

    return obj;
  }
  toKeys(): string[] {
    return [...super.keys()];
  }
  toValues(): T[] {
    return [...super.values()];
  }
  copy() {
    return new RelayMap(this.toObject());
  }
}

export class RelaySet extends Set<string> {
  constructor(obj?: string[], options?: { trusted?: boolean }) {
    super();

    if (!obj) {
      return;
    }

    for (const url of obj) {
      if (options?.trusted) {
        super.add(url);
      } else {
        this.add(url);
      }
    }
  }
  add(url: string) {
    const u = normalizeRelayUrl(url);
    if (u === null) {
      return this;
    }

    return super.add(u);
  }
  has(url: string): boolean {
    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return super.has(u);
  }
  delete(url: string) {
    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return super.delete(u);
  }
}

export class RelayGroup {
  #relays = new RelaySet();
  #disposables = new DisposableStack();
  #stream: Subject<RelayGroupUpdate> = this.#disposables.adopt(new Subject(), (v) => v.complete());

  constructor(relays?: string[]) {
    for (const url of relays || []) {
      this.#relays.add(url);
    }
  }

  set(...urls: string[]) {
    const next = new RelaySet(urls);
    const current = this.#relays;

    const update: RelayGroupUpdate = {
      appended: new RelaySet([...next.difference(current)], { trusted: true }),
      outdated: new RelaySet([...current.difference(next)], { trusted: true }),
      keep: new RelaySet([...current.intersection(next)], { trusted: true }),
    };

    this.#relays = next;

    this.#stream.next(update);

    return update;
  }

  add(...urls: string[]) {
    const added = new RelaySet(urls);
    const current = this.#relays;

    const update: RelayGroupUpdate = {
      appended: new RelaySet([...added.difference(current)], { trusted: true }),
      outdated: new RelaySet(),
      keep: new RelaySet([...current], { trusted: true }),
    };

    for (const url of update.appended) {
      this.#relays.add(url);
    }

    this.#stream.next(update);

    return update;
  }

  remove(...urls: string[]) {
    const removed = new RelaySet(urls);
    const current = this.#relays;

    const update: RelayGroupUpdate = {
      appended: new RelaySet(),
      outdated: new RelaySet([...current.intersection(removed)], { trusted: true }),
      keep: new RelaySet([...current.difference(removed)], { trusted: true }),
    };

    for (const url of update.outdated) {
      this.#relays.delete(url);
    }

    this.#stream.next(update);

    return update;
  }

  clear() {
    const current = this.#relays;

    const update: RelayGroupUpdate = {
      appended: new RelaySet(),
      outdated: new RelaySet([...current], { trusted: true }),
      keep: new RelaySet(),
    };

    this.#relays.clear();

    this.#stream.next(update);

    return update;
  }

  subscribe = this.#stream.subscribe.bind(this.#stream);

  values() {
    return this.#relays.values();
  }

  [Symbol.dispose] = once(() => this.#disposables.dispose());
  dispose = this[Symbol.dispose];
}

export interface RelayGroupUpdate {
  appended: RelaySet;
  outdated: RelaySet;
  keep: RelaySet;
}
