import comp from "/home/poman/desktop/nostr/rx-nostr/docs/.vuepress/.temp/pages/docs/v1/getting-started.html.vue"
const data = JSON.parse("{\"path\":\"/docs/v1/getting-started.html\",\"title\":\"Getting Started\",\"lang\":\"ja_JP\",\"frontmatter\":{},\"headers\":[{\"level\":2,\"title\":\"Installation\",\"slug\":\"installation\",\"link\":\"#installation\",\"children\":[]},{\"level\":2,\"title\":\"Playground\",\"slug\":\"playground\",\"link\":\"#playground\",\"children\":[]}],\"git\":{\"updatedTime\":null,\"contributors\":[]},\"filePathRelative\":\"docs/v1/getting-started.md\"}")
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
