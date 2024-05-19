export const themeData = JSON.parse("{\"navbar\":[{\"text\":\"Docs\",\"children\":[{\"text\":\"v1.x\",\"link\":\"/v1/\"},{\"text\":\"v2.x\",\"link\":\"/v2/\"}]},{\"text\":\"GitHub\",\"link\":\"https://github.com/penpenpng/rx-nostr\"}],\"sidebar\":{\"/v1/\":[{\"text\":\"Introduction\",\"children\":[\"/v1/index.md\",\"/v1/getting-started.md\",\"/v1/first-step.md\"]},{\"text\":\"Guide\",\"children\":[\"/v1/req-strategy.md\",\"/v1/relay-configuration.md\",\"/v1/lazy-since-until.md\",\"/v1/sending-event.md\",\"/v1/monitoring-connections.md\",\"/v1/error-handling.md\",\"/v1/operators.md\"]},{\"text\":\"Examples\",\"link\":\"/v1/examples.md\"}],\"/v2/\":[{\"text\":\"Introduction\",\"children\":[\"/v2/index.md\",\"/v2/installation.md\",\"/v2/getting-started.md\"]},{\"text\":\"Publish / Subscribe\",\"children\":[\"/v2/publish-event.md\",\"/v2/subscribe-event.md\",\"/v2/relay-configuration.md\"]},{\"text\":\"Connection Management\",\"children\":[\"/v2/connection-strategy.md\",\"/v2/reconnection.md\",\"/v2/monitoring-connections.md\"]},{\"text\":\"Operators\",\"children\":[\"/v2/operators.md\",\"/v2/event-packet-operators.md\",\"/v2/req-packet-operators.md\",\"/v2/ok-packet-operators.md\",\"/v2/message-packet-operators.md\",\"/v2/general-operators.md\"]},{\"text\":\"Addendum\",\"children\":[\"/v2/auto-filtering.md\",\"/v2/auth.md\",\"/v2/nip11-registry.md\",\"/v2/other-observables.md\",\"/v2/delegation.md\"]}]},\"editLinkText\":\"このページを編集\",\"docsRepo\":\"https://github.com/penpenpng/rx-nostr\",\"docsBranch\":\"main\",\"docsDir\":\"docs\",\"locales\":{\"/\":{\"selectLanguageName\":\"English\"}},\"colorMode\":\"auto\",\"colorModeSwitch\":true,\"logo\":null,\"repo\":null,\"selectLanguageText\":\"Languages\",\"selectLanguageAriaLabel\":\"Select language\",\"sidebarDepth\":2,\"editLink\":true,\"lastUpdated\":true,\"lastUpdatedText\":\"Last Updated\",\"contributors\":true,\"contributorsText\":\"Contributors\",\"notFound\":[\"There's nothing here.\",\"How did we get here?\",\"That's a Four-Oh-Four.\",\"Looks like we've got some broken links.\"],\"backToHome\":\"Take me home\",\"openInNewWindow\":\"open in new window\",\"toggleColorMode\":\"toggle color mode\",\"toggleSidebar\":\"toggle sidebar\"}")

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
  if (__VUE_HMR_RUNTIME__.updateThemeData) {
    __VUE_HMR_RUNTIME__.updateThemeData(themeData)
  }
}

if (import.meta.hot) {
  import.meta.hot.accept(({ themeData }) => {
    __VUE_HMR_RUNTIME__.updateThemeData(themeData)
  })
}
