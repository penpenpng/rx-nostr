import { defineContent } from "./helper";

export const content = defineContent({
  2: [
    {
      text: "Introduction",
      items: [
        { text: "Overview", link: "" },
        { text: "Installation", link: "installation" },
        { text: "Getting Started", link: "getting-started" },
      ],
    },
    {
      text: "Publish / Subscribe",
      items: [
        { text: "Publish EVENT", link: "publish-event" },
        { text: "Subscribe EVENT", link: "subscribe-event" },
        { text: "Relay Configuration", link: "relay-configuration" },
      ],
    },
    {
      text: "Connection Management",
      items: [
        { text: "Connection Strategy", link: "connection-strategy" },
        { text: "Reconnection", link: "reconnection" },
        {
          text: "Monitoring Connections",
          link: "monitoring-connections",
        },
      ],
    },
    {
      text: "Operators",
      items: [
        { text: "Overview", link: "operators" },
        { text: "EventPacket", link: "event-packet-operators" },
        { text: "ReqPacket", link: "req-packet-operators" },
        { text: "OkPacket", link: "ok-packet-operators" },
        { text: "MessagePacket", link: "message-packet-operators" },
        { text: "General", link: "general-operators" },
      ],
    },
    {
      text: "Addendum",
      items: [
        { text: "Auto Filtering", link: "auto-filtering" },
        { text: "AUTH", link: "auth" },
        { text: "NIP-11 Registry", link: "nip11-registry" },
        { text: "Other Observables", link: "other-observables" },
        { text: "Delegation", link: "delegation" },
      ],
    },
  ],
  3: [
    {
      text: "Introduction",
      items: [
        { text: "Why rx-nostr?", link: "" },
        { text: "Migration Guide", link: "migration-guide" },
        { text: "Installation", link: "installation" },
        { text: "Getting Started", link: "getting-started" },
      ],
    },
    {
      text: "Publish / Subscribe",
      items: [
        { text: "Publish EVENT", link: "publish-event" },
        { text: "Subscribe EVENT", link: "subscribe-event" },
        { text: "Relay Configuration", link: "relay-configuration" },
      ],
    },
    {
      text: "Sign / Verify",
      items: [
        { text: "Signer", link: "signer" },
        { text: "Verifier", link: "verifier" },
      ],
    },
    {
      text: "Connection Management",
      items: [
        { text: "Connection Strategy", link: "connection-strategy" },
        { text: "Reconnection", link: "reconnection" },
        {
          text: "Monitoring Connections",
          link: "monitoring-connections",
        },
      ],
    },
    {
      text: "Operators",
      items: [
        { text: "Operators", link: "operators" },
        { text: "EventPacket", link: "event-packet-operators" },
        { text: "ReqPacket", link: "req-packet-operators" },
        { text: "OkPacket", link: "ok-packet-operators" },
        { text: "MessagePacket", link: "message-packet-operators" },
        { text: "General", link: "general-operators" },
      ],
    },
    {
      text: "Addendum",
      items: [
        { text: "AUTH", link: "auth" },
        { text: "NIP-11 Registry", link: "nip11-registry" },
        { text: "Auto Filtering", link: "auto-filtering" },
        { text: "Other Observables", link: "other-observables" },
        { text: "Dispose", link: "dispose" },
      ],
    },
  ],
});
