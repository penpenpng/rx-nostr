# Getting Started

## Installation

npm または yarn から以下の通りインストールできます。

:::: code-group
::: code-group-item npm

```sh:no-line-numbers
npm install rx-nostr
```

:::
::: code-group-item yarn

```sh:no-line-numbers
yarn add rx-nostr
```

:::
::::

## Playground

rx-nostr をすぐに試したい場合は以下の通りリポジトリをクローンして、`app/main.ts` を編集して動作を確認することができます。

```sh:no-line-numbers
git clone https://github.com/penpenpng/rx-nostr
cd rx-nostr
npm install
npm run dev

# then, open http://localhost:5173/ and edit ./app/main.ts
```

vite の HMR により、`app/main.ts` の変更が保存されるとページが即座にリロードされスクリプトは再実行されます。
