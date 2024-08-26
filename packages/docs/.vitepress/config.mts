import { defineConfig } from "vitepress";
import * as v2 from "./v2";
import * as v3 from "./v3";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "rx-nostr",
  description: "rx-nostr documentation",

  base: "/rx-nostr/",
  locales: {
    root: {
      label: "Japanese",
      lang: "ja",
    },
    en: {
      label: "English",
      lang: "en",
    },
  },

  themeConfig: {
    nav: [{ text: "version", items: [v2.nav, v3.nav] }],
    sidebar: { ...v2.sidebar, ...v3.sidebar },
    socialLinks: [
      { icon: "github", link: "https://github.com/penpenpng/rx-nostr" },
    ],
  },
});
