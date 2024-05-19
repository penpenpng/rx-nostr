export const siteData = JSON.parse("{\"base\":\"/rx-nostr/\",\"lang\":\"ja_JP\",\"title\":\"rx-nostr\",\"description\":\"A library based on RxJS, which allows Nostr applications to easily communicate with relays.\",\"head\":[],\"locales\":{}}")

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
  if (__VUE_HMR_RUNTIME__.updateSiteData) {
    __VUE_HMR_RUNTIME__.updateSiteData(siteData)
  }
}

if (import.meta.hot) {
  import.meta.hot.accept(({ siteData }) => {
    __VUE_HMR_RUNTIME__.updateSiteData(siteData)
  })
}
