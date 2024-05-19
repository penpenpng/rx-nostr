import comp from "/home/poman/desktop/nostr/rx-nostr/docs/.vuepress/.temp/pages/docs/first-step.html.vue"
const data = JSON.parse("{\"path\":\"/docs/first-step.html\",\"title\":\"First Step\",\"lang\":\"ja_JP\",\"frontmatter\":{},\"headers\":[],\"git\":{\"updatedTime\":1695200943000,\"contributors\":[{\"name\":\"penpenpng\",\"email\":\"poman1638m@gmail.com\",\"commits\":3},{\"name\":\"Yasuhiro Matsumoto\",\"email\":\"mattn.jp@gmail.com\",\"commits\":1}]},\"filePathRelative\":\"docs/first-step.md\"}")
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
