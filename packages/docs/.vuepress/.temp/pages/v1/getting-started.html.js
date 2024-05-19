import comp from "/home/poman/desktop/nostr/rx-nostr/packages/docs/.vuepress/.temp/pages/v1/getting-started.html.vue"
const data = JSON.parse("{\"path\":\"/v1/getting-started.html\",\"title\":\"Getting Started\",\"lang\":\"ja_JP\",\"frontmatter\":{},\"headers\":[{\"level\":2,\"title\":\"Installation\",\"slug\":\"installation\",\"link\":\"#installation\",\"children\":[]},{\"level\":2,\"title\":\"Playground\",\"slug\":\"playground\",\"link\":\"#playground\",\"children\":[]}],\"git\":{\"updatedTime\":null,\"contributors\":[]},\"filePathRelative\":\"v1/getting-started.md\"}")
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
