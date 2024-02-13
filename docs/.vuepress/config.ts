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
        children: [
          { text: "v1.x", link: "/v1/" },
          { text: "v2.x", link: "/v2/ja/" },
        ],
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
      "/v2/en/": [
        {
          text: "Introduction",
          children: [
            "/v2/en/index.md",
            "/v2/en/installation.md",
            "/v2/en/getting-started.md",
          ],
        },
        {
          text: "Publish / Subscribe",
          children: [
            "/v2/en/publish-event.md",
            "/v2/en/subscribe-event.md",
            "/v2/en/relay-configuration.md",
          ],
        },
        {
          text: "Connection Management",
          children: [
            "/v2/en/connection-strategy.md",
            "/v2/en/reconnection.md",
            "/v2/en/monitoring-connections.md",
          ],
        },
        {
          text: "Operators",
          children: ["/v2/en/operators.md", "/v2/en/examples.md"],
        },
        {
          text: "Addendum",
          children: [
            "/v2/en/auto-filtering.md",
            "/v2/en/auth.md",
            "/v2/en/nip11-registry.md",
            "/v2/en/error-handling.md",
            "/v2/en/debugging.md",
          ],
        },
      ],
      "/v2/ja/": [
        {
          text: "Introduction",
          children: [
            "/v2/ja/index.md",
            "/v2/ja/installation.md",
            "/v2/ja/getting-started.md",
          ],
        },
        {
          text: "Publish / Subscribe",
          children: [
            "/v2/ja/publish-event.md",
            "/v2/ja/subscribe-event.md",
            "/v2/ja/relay-configuration.md",
          ],
        },
        {
          text: "Connection Management",
          children: [
            "/v2/ja/connection-strategy.md",
            "/v2/ja/reconnection.md",
            "/v2/ja/monitoring-connections.md",
          ],
        },
        {
          text: "Operators",
          children: ["/v2/ja/operators.md", "/v2/ja/examples.md"],
        },
        {
          text: "Addendum",
          children: [
            "/v2/ja/auto-filtering.md",
            "/v2/ja/auth.md",
            "/v2/ja/nip11-registry.md",
            "/v2/ja/error-handling.md",
            "/v2/ja/debugging.md",
          ],
        },
      ],
    },
    editLinkText: "このページを編集",
    docsRepo: "https://github.com/penpenpng/rx-nostr",
    docsBranch: "main",
    docsDir: "docs",
  }),
});
