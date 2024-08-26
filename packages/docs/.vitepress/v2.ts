import type { DefaultTheme } from "vitepress";

export const nav: DefaultTheme.NavItemWithLink = { text: "v2.x", link: "/v2" };

export const sidebar: DefaultTheme.Sidebar = {
  "/v2/": [
    {
      text: "Introduction",
      items: [
        { text: "Overview", link: "/v2/index" },
        { text: "Installation", link: "/v2/installation" },
      ],
    },
    {
      text: "Publish / Subscribe",
      items: [
        { text: "Publish EVENT", link: "/v2/publish-event" },
        { text: "Subscribe EVENT", link: "/v2/subscribe-event" },
        { text: "Relay Configuration", link: "/v2/relay-configuration" },
      ],
    },
    {
      text: "Connection Management",
      items: [
        { text: "Connection Strategy", link: "/v2/connection-strategy" },
        { text: "Reconnection", link: "/v2/reconnection" },
        {
          text: "Monitoring Connections",
          link: "/v2/monitoring-connections",
        },
      ],
    },
    {
      text: "Operators",
      items: [
        { text: "Overview", link: "/v2/operators" },
        { text: "EventPacket", link: "/v2/event-packet-operators" },
        { text: "ReqPacket", link: "/v2/req-packet-operators" },
        { text: "OkPacket", link: "/v2/ok-packet-operators" },
        { text: "MessagePacket", link: "/v2/message-packet-operators" },
        { text: "General", link: "/v2/general-operators" },
      ],
    },
    {
      text: "Addendum",
      items: [
        { text: "Auto Filtering", link: "/v2/auto-filtering" },
        { text: "AUTH", link: "/v2/auth" },
        { text: "NIP-11 Registry", link: "/v2/nip11-registry" },
        { text: "Other Observables", link: "/v2/other-observables" },
        { text: "Delegation", link: "/v2/delegation" },
      ],
    },
  ],
};
