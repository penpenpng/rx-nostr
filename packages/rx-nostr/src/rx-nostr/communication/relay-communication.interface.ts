import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";

import type { LazyFilter } from "../../lazy-filter/index.ts";
import type { RelayUrl } from "../../libs/index.ts";
import type { EventPacket, OkPacket } from "../../packets/index.ts";

export interface IRelayCommunication {
  readonly url: RelayUrl;
  hold(): () => void;
  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
    options?: Readonly<{
      timeout?: number;
      validateFilterMatching?: boolean;
    }>,
  ): Observable<EventPacket>;
  event(event: Nostr.Event, options?: Readonly<{ timeout?: number }>): Observable<OkPacket>;
  castEvent(event: Nostr.Event, options?: Readonly<{ timeout?: number }>): Observable<void>;
}
