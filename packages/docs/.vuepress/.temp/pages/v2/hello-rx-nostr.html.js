import comp from "/home/poman/desktop/nostr/rx-nostr/docs/.vuepress/.temp/pages/v2/hello-rx-nostr.html.vue"
const data = JSON.parse("{\"path\":\"/v2/hello-rx-nostr.html\",\"title\":\"Hello, rx-nostr\",\"lang\":\"ja_JP\",\"frontmatter\":{},\"headers\":[],\"git\":{\"updatedTime\":null,\"contributors\":[]},\"filePathRelative\":\"v2/hello-rx-nostr.md\"}")
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
