import { defineUserConfig } from "vuepress";
import { viteBundler } from "@vuepress/bundler-vite";
import { defaultTheme } from "@vuepress/theme-default";
import attrs from "markdown-it-attrs";

export default defineUserConfig({
  bundler: viteBundler(),
  // To host on GitHub Pages.
  base: "/rx-nostr/",
  lang: "ja_JP",
  title: "rx-nostr",
  description:
    "A library based on RxJS, which allows Nostr applications to easily communicate with relays.",
  // Ban README.md. Use index.md instead.
  pagePatterns: ["**/*.md", "!**/README.md", "!.vuepress", "!node_modules"],
  markdown: {
    code: {
      lineNumbers: false,
    },
  },
  extendsMarkdown: (md) => {
    // Allow `# Header Text [#custom-id-attr]` syntax.
    // Default delimiters `{}` conflict with [line highlighting](https://v2.vuepress.vuejs.org/guide/markdown.html#code-blocks) feature.
    md.use(attrs, {
      leftDelimiter: "[",
      rightDelimiter: "]",
    });
  },
  theme: defaultTheme({
    navbar: [
      {
        text: "Docs",
        link: "/v1/",
      },
      {
        text: "GitHub",
        link: "https://github.com/penpenpng/rx-nostr",
      },
    ],
    sidebar: {
      "/v1/": [
        {
          text: "Introduction",
          children: [
            "/v1/index.md",
            "/v1/getting-started.md",
            "/v1/first-step.md",
          ],
        },
        {
          text: "Guide",
          children: [
            "/v1/req-strategy.md",
            "/v1/relay-configuration.md",
            "/v1/lazy-since-until.md",
            "/v1/sending-event.md",
            "/v1/monitoring-connections.md",
            "/v1/error-handling.md",
            "/v1/operators.md",
          ],
        },
        {
          text: "Examples",
          link: "/v1/examples.md",
        },
      ],
    },
    editLinkText: "このページを編集",
    docsRepo: "https://github.com/penpenpng/rx-nostr",
    docsBranch: "main",
    docsDir: "docs",
  }),
});
