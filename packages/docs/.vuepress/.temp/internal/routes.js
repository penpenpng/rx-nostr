export const redirects = JSON.parse("{}")

export const routes = Object.fromEntries([
  ["/", { loader: () => import(/* webpackChunkName: "index.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/index.html.js"), meta: {"title":""} }],
  ["/v1/error-handling.html", { loader: () => import(/* webpackChunkName: "v1_error-handling.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/error-handling.html.js"), meta: {"title":"Error Handling"} }],
  ["/v1/examples.html", { loader: () => import(/* webpackChunkName: "v1_examples.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/examples.html.js"), meta: {"title":"Examples"} }],
  ["/v1/first-step.html", { loader: () => import(/* webpackChunkName: "v1_first-step.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/first-step.html.js"), meta: {"title":"First Step"} }],
  ["/v1/getting-started.html", { loader: () => import(/* webpackChunkName: "v1_getting-started.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/getting-started.html.js"), meta: {"title":"Getting Started"} }],
  ["/v1/", { loader: () => import(/* webpackChunkName: "v1_index.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/index.html.js"), meta: {"title":"Overview"} }],
  ["/v1/lazy-since-until.html", { loader: () => import(/* webpackChunkName: "v1_lazy-since-until.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/lazy-since-until.html.js"), meta: {"title":"Lazy since/until (v1.2.0+)"} }],
  ["/v1/monitoring-connections.html", { loader: () => import(/* webpackChunkName: "v1_monitoring-connections.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/monitoring-connections.html.js"), meta: {"title":"Monitoring Connections"} }],
  ["/v1/operators.html", { loader: () => import(/* webpackChunkName: "v1_operators.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/operators.html.js"), meta: {"title":"Operators"} }],
  ["/v1/relay-configuration.html", { loader: () => import(/* webpackChunkName: "v1_relay-configuration.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/relay-configuration.html.js"), meta: {"title":"Relay Configuration"} }],
  ["/v1/req-strategy.html", { loader: () => import(/* webpackChunkName: "v1_req-strategy.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/req-strategy.html.js"), meta: {"title":"REQ Strategy"} }],
  ["/v1/sending-event.html", { loader: () => import(/* webpackChunkName: "v1_sending-event.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/sending-event.html.js"), meta: {"title":"Sending EVENT"} }],
  ["/v2/auth.html", { loader: () => import(/* webpackChunkName: "v2_auth.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/auth.html.js"), meta: {"title":"AUTH"} }],
  ["/v2/auto-filtering.html", { loader: () => import(/* webpackChunkName: "v2_auto-filtering.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/auto-filtering.html.js"), meta: {"title":"Auto Filtering"} }],
  ["/v2/connection-strategy.html", { loader: () => import(/* webpackChunkName: "v2_connection-strategy.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/connection-strategy.html.js"), meta: {"title":"Connection Strategy"} }],
  ["/v2/delegation.html", { loader: () => import(/* webpackChunkName: "v2_delegation.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/delegation.html.js"), meta: {"title":"Delegation"} }],
  ["/v2/event-packet-operators.html", { loader: () => import(/* webpackChunkName: "v2_event-packet-operators.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/event-packet-operators.html.js"), meta: {"title":"EventPacket Operators"} }],
  ["/v2/general-operators.html", { loader: () => import(/* webpackChunkName: "v2_general-operators.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/general-operators.html.js"), meta: {"title":"General Operators"} }],
  ["/v2/getting-started.html", { loader: () => import(/* webpackChunkName: "v2_getting-started.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/getting-started.html.js"), meta: {"title":"Getting Started"} }],
  ["/v2/", { loader: () => import(/* webpackChunkName: "v2_index.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/index.html.js"), meta: {"title":"Overview"} }],
  ["/v2/installation.html", { loader: () => import(/* webpackChunkName: "v2_installation.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/installation.html.js"), meta: {"title":"Installation"} }],
  ["/v2/message-packet-operators.html", { loader: () => import(/* webpackChunkName: "v2_message-packet-operators.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/message-packet-operators.html.js"), meta: {"title":"MessagePacket Operators"} }],
  ["/v2/monitoring-connections.html", { loader: () => import(/* webpackChunkName: "v2_monitoring-connections.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/monitoring-connections.html.js"), meta: {"title":"Monitoring Connections"} }],
  ["/v2/nip11-registry.html", { loader: () => import(/* webpackChunkName: "v2_nip11-registry.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/nip11-registry.html.js"), meta: {"title":"NIP-11 Registry"} }],
  ["/v2/ok-packet-operators.html", { loader: () => import(/* webpackChunkName: "v2_ok-packet-operators.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/ok-packet-operators.html.js"), meta: {"title":"OkPacket Operators"} }],
  ["/v2/operators.html", { loader: () => import(/* webpackChunkName: "v2_operators.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/operators.html.js"), meta: {"title":"Operators"} }],
  ["/v2/other-observables.html", { loader: () => import(/* webpackChunkName: "v2_other-observables.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/other-observables.html.js"), meta: {"title":"Other Observables"} }],
  ["/v2/publish-event.html", { loader: () => import(/* webpackChunkName: "v2_publish-event.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/publish-event.html.js"), meta: {"title":"Publish EVENT"} }],
  ["/v2/reconnection.html", { loader: () => import(/* webpackChunkName: "v2_reconnection.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/reconnection.html.js"), meta: {"title":"Reconnection"} }],
  ["/v2/relay-configuration.html", { loader: () => import(/* webpackChunkName: "v2_relay-configuration.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/relay-configuration.html.js"), meta: {"title":"Relay Configuration"} }],
  ["/v2/req-packet-operators.html", { loader: () => import(/* webpackChunkName: "v2_req-packet-operators.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/req-packet-operators.html.js"), meta: {"title":"ReqPacket Operators"} }],
  ["/v2/subscribe-event.html", { loader: () => import(/* webpackChunkName: "v2_subscribe-event.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v2/subscribe-event.html.js"), meta: {"title":"Subscribe EVENT"} }],
  ["/404.html", { loader: () => import(/* webpackChunkName: "404.html" */"/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/404.html.js"), meta: {"title":""} }],
]);

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
  if (__VUE_HMR_RUNTIME__.updateRoutes) {
    __VUE_HMR_RUNTIME__.updateRoutes(routes)
  }
  if (__VUE_HMR_RUNTIME__.updateRedirects) {
    __VUE_HMR_RUNTIME__.updateRedirects(redirects)
  }
}

if (import.meta.hot) {
  import.meta.hot.accept(({ routes, redirects }) => {
    __VUE_HMR_RUNTIME__.updateRoutes(routes)
    __VUE_HMR_RUNTIME__.updateRedirects(redirects)
  })
}
