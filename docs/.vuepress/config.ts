import { defineUserConfig, defaultTheme } from "vuepress";
import attrs from "markdown-it-attrs";

export default defineUserConfig({
  // To host on GitHub Pages.
  base: "/rx-nostr/",
  lang: "ja_JP",
  title: "rx-nostr",
  description:
    "A library based on RxJS, which allows Nostr applications to easily communicate with relays.",
  // Ban README.md. Use index.md instead.
  pagePatterns: ["**/*.md", "!**/README.md", "!.vuepress", "!node_modules"],
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
        text: "Guide",
        link: "/guide/",
      },
      {
        text: "API",
        link: "/api/",
        children: [
          {
            text: "RxNostr",
            link: "/api/rx-nostr",
          },
          {
            text: "RxReq",
            link: "/api/rx-req",
          },
          {
            text: "Operators",
            link: "/api/operators",
          },
        ],
      },
      {
        text: "GitHub",
        link: "https://github.com/penpenpng/rx-nostr",
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          children: [
            "/guide/index.md",
            "/guide/getting-started.md",
            "/guide/first-step.md",
            "/guide/req-strategy.md",
            "/guide/operators.md",
            "/guide/examples.md",
          ],
        },
      ],
      "/api/": [
        {
          text: "API",
          children: ["/api/rx-nostr.md", "/api/rx-req.md", "/api/operators.md"],
        },
      ],
    },
    editLinkText: "このページを編集",
    docsRepo: "https://github.com/penpenpng/rx-nostr",
    docsBranch: "main",
    docsDir: "docs",
  }),
});
