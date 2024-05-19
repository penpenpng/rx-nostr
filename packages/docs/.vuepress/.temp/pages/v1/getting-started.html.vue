<template><div><h1 id="getting-started" tabindex="-1"><a class="header-anchor" href="#getting-started"><span>Getting Started</span></a></h1>
<div class="custom-container danger"><p class="custom-container-title">Caution</p>
<p>このドキュメントは rx-nostr 1.x のものです。2.x のドキュメントは<RouteLink to="/v2/">こちら</RouteLink>を参照してください。</p>
</div>
<h2 id="installation" tabindex="-1"><a class="header-anchor" href="#installation"><span>Installation</span></a></h2>
<p>npm または yarn から以下の通りインストールできます。</p>
<CodeGroup>
<CodeGroupItem title="npm">
<div class="language-bash" data-ext="sh" data-title="sh"><pre v-pre class="language-bash"><code><span class="token function">npm</span> <span class="token function">install</span> rx-nostr
</code></pre></div></CodeGroupItem>
<CodeGroupItem title="yarn">
<div class="language-bash" data-ext="sh" data-title="sh"><pre v-pre class="language-bash"><code><span class="token function">yarn</span> <span class="token function">add</span> rx-nostr
</code></pre></div></CodeGroupItem>
</CodeGroup>
<div class="custom-container tip"><p class="custom-container-title">Node</p>
<p>rx-nostr を Node.js ランタイムの上で使用する場合は <a href="https://www.npmjs.com/package/websocket-polyfill" target="_blank" rel="noopener noreferrer">websocket-polyfill</a> も同時にインストールする必要があります。</p>
</div>
<h2 id="playground" tabindex="-1"><a class="header-anchor" href="#playground"><span>Playground</span></a></h2>
<p>rx-nostr をすぐに試したい場合は以下の通りリポジトリをクローンして、<code v-pre>app/main.ts</code> を編集して動作を確認することができます。</p>
<div class="language-bash" data-ext="sh" data-title="sh"><pre v-pre class="language-bash"><code><span class="token function">git</span> clone https://github.com/penpenpng/rx-nostr
<span class="token builtin class-name">cd</span> rx-nostr
<span class="token function">npm</span> <span class="token function">install</span>
<span class="token function">npm</span> run dev

<span class="token comment"># then, open http://localhost:5173/ and edit ./app/main.ts</span>
</code></pre></div><p>vite の HMR により、<code v-pre>app/main.ts</code> の変更が保存されるとページが即座にリロードされスクリプトは再実行されます。</p>
</div></template>


