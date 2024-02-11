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
        link: "/docs/",
      },
      {
        text: "GitHub",
        link: "https://github.com/penpenpng/rx-nostr",
      },
    ],
    sidebar: {
      "/docs/": [
        {
          text: "Introduction",
          children: [
            "/docs/index.md",
            "/docs/getting-started.md",
            "/docs/first-step.md",
          ],
        },
        {
          text: "Guide",
          children: [
            "/docs/req-strategy.md",
            "/docs/relay-configuration.md",
            "/docs/lazy-since-until.md",
            "/docs/sending-event.md",
            "/docs/monitoring-connections.md",
            "/docs/error-handling.md",
            "/docs/operators.md",
          ],
        },
        {
          text: "Examples",
          link: "/docs/examples.md",
        },
      ],
    },
    editLinkText: "このページを編集",
    docsRepo: "https://github.com/penpenpng/rx-nostr",
    docsBranch: "main",
    docsDir: "docs",
  }),
});
