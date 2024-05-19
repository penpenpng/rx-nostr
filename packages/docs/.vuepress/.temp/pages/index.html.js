import comp from "/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/index.html.vue"
const data = JSON.parse("{\"path\":\"/\",\"title\":\"\",\"lang\":\"ja_JP\",\"frontmatter\":{\"home\":true,\"tagline\":\"Easier and more carefully communications\",\"actions\":[{\"text\":\"Get Started\",\"link\":\"./v2/\",\"type\":\"primary\"}],\"features\":[{\"title\":\"REQ Queuing\",\"details\":\"Properly queue REQ requests so that concurrent REQ subscriptions do not exceed the limit.\"},{\"title\":\"WebSocket Reconnection\",\"details\":\"Reconnect WebSocket under an appropriate back-off strategy, and properly restore REQ subscriptions.\"},{\"title\":\"Adaptive Relay Pool\",\"details\":\"Reconfigure ongoing communications in response to changes in the relay pool.\"},{\"title\":\"Respect NIP-11 limitations\",\"details\":\"Optimize behavior with respecting to NIP-11 limitation.\"},{\"title\":\"AUTH Support\",\"details\":\"With only a few settings, gets fully compatible with AUTH based on NIP-42.\"},{\"title\":\"Integration with RxJS\",\"details\":\"Seamless integration with RxJS. Take full advantage of RxJS's highly expressive declarative notation.\"}],\"footer\":\"2024 penpenpng\"},\"headers\":[],\"git\":{\"updatedTime\":null,\"contributors\":[]},\"filePathRelative\":\"index.md\"}")
export { comp, data }

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
  if (__VUE_HMR_RUNTIME__.updatePageData) {
    __VUE_HMR_RUNTIME__.updatePageData(data)
  }
}

if (import.meta.hot) {
  import.meta.hot.accept(({ data }) => {
    __VUE_HMR_RUNTIME__.updatePageData(data)
  })
}
