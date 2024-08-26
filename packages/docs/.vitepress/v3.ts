import type { DefaultTheme } from "vitepress";

export const nav: DefaultTheme.NavItemWithLink = { text: "v3.x", link: "/v3" };

export const sidebar: DefaultTheme.Sidebar = {
  "/v3/": [
    {
      text: "Introduction",
      items: [
        { text: "Overview", link: "/v3/index" },
        { text: "Installation", link: "/v3/installation" },
        { text: "Getting Started", link: "/v3/getting-started" },
      ],
    },
    {
      text: "Publish / Subscribe",
      items: [
        { text: "Publish EVENT", link: "/v3/publish-event" },
        { text: "Subscribe EVENT", link: "/v3/subscribe-event" },
        { text: "Relay Configuration", link: "/v3/relay-configuration" },
      ],
    },
    {
      text: "Connection Management",
      items: [
        { text: "Connection Strategy", link: "/v3/connection-strategy" },
        { text: "Reconnection", link: "/v3/reconnection" },
        {
          text: "Monitoring Connections",
          link: "/v3/monitoring-connections",
        },
      ],
    },
    {
      text: "Operators",
      items: [
        { text: "Overview", link: "/v3/operators" },
        { text: "EventPacket", link: "/v3/event-packet-operators" },
        { text: "ReqPacket", link: "/v3/req-packet-operators" },
        { text: "OkPacket", link: "/v3/ok-packet-operators" },
        { text: "MessagePacket", link: "/v3/message-packet-operators" },
        { text: "General", link: "/v3/general-operators" },
      ],
    },
    {
      text: "Addendum",
      items: [
        { text: "Auto Filtering", link: "/v3/auto-filtering" },
        { text: "AUTH", link: "/v3/auth" },
        { text: "NIP-11 Registry", link: "/v3/nip11-registry" },
        { text: "Other Observables", link: "/v3/other-observables" },
        { text: "Delegation", link: "/v3/delegation" },
      ],
    },
  ],
};
