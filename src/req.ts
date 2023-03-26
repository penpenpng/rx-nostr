import { Observable } from "rxjs";

import { Nostr } from "./nostr/primitive";

export interface Req {
  subId: string;
  filters: Observable<Nostr.Filter[]> | Nostr.Filter[];
}
