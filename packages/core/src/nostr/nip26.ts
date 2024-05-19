import * as Nostr from "nostr-typedef";

import { schnorr, sha256 } from "./hash.js";

type DelegationTag = [
  tagName: "delegation",
  delegator: string,
  query: string,
  token: string,
];

interface Delegation {
  kinds?: number[];
  since?: number;
  until?: number;
}

export function validateDelegation(event: Nostr.Event): boolean {
  const tag = getDelegationTag(event);
  if (!tag) {
    return true;
  }

  const [, delegator, query, token] = tag;
  const hash = sha256(`nostr:${event.pubkey}:${query}`);

  if (!schnorr.verify(token, hash, delegator)) {
    return false;
  }

  try {
    const { kinds, since, until } = parseDelegationQuery(query);

    return (
      (kinds === undefined || kinds.includes(event.kind)) &&
      (since === undefined || since < event.created_at) &&
      (until === undefined || event.created_at < until)
    );
  } catch {
    return false;
  }
}

export function isDelegatedBy(event: Nostr.Event, rootPubkey: string): boolean {
  const tag = getDelegationTag(event);
  if (!tag) {
    return false;
  }

  const delegator = tag[1];
  return delegator === rootPubkey;
}

export function getRootPubkey(event: Nostr.Event): string {
  const tag = getDelegationTag(event);
  if (tag) {
    return tag[1];
  } else {
    return event.pubkey;
  }
}

export function getDelegationTag(event: Nostr.Event): DelegationTag | null {
  return (event.tags.find((t) => t[0] === "delegation" && t.length === 4) ??
    null) as DelegationTag | null;
}

export function parseDelegationQuery(query: string): Delegation {
  const kinds: number[] = [];
  let since: number | undefined = undefined;
  let until: number | undefined = undefined;

  const conditions = query.split("&");

  for (const c of conditions) {
    if (c.startsWith("kind=")) {
      const kind = Number(c.split("kind=")[1]);
      if (Number.isNaN(kind)) {
        throw new Error();
      }

      kinds.push(kind);
    } else if (c.startsWith("created_at<")) {
      const t = Number(c.split("created_at<")[1]);

      until = Math.min(until ?? Infinity, t);
    } else if (c.startsWith("created_at>")) {
      const t = Number(c.split("created_at>")[1]);

      since = Math.max(until ?? -Infinity, t);
    } else {
      throw new Error();
    }
  }

  return {
    kinds: kinds.length > 0 ? kinds : undefined,
    since,
    until,
  };
}
