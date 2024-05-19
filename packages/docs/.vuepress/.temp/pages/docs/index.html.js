import comp from "/home/poman/desktop/nostr/rx-nostr/docs/.vuepress/.temp/pages/docs/index.html.vue"
const data = JSON.parse("{\"path\":\"/docs/\",\"title\":\"Overview\",\"lang\":\"ja_JP\",\"frontmatter\":{},\"headers\":[],\"git\":{\"updatedTime\":1701524032000,\"contributors\":[{\"name\":\"penpenpng\",\"email\":\"poman1638m@gmail.com\",\"commits\":6}]},\"filePathRelative\":\"docs/index.md\"}")
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
