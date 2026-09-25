import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { AuthenticatorInput } from "../../authenticator/index.ts";
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
      authenticator?: AuthenticatorInput;
    }>,
  ): Observable<EventPacket>;
  event(
    event: Nostr.Event,
    options?: Readonly<{ authenticator?: AuthenticatorInput; timeout?: number }>,
  ): Observable<OkPacket>;
}
