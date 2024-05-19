<template><div><h1 id="installation" tabindex="-1"><a class="header-anchor" href="#installation"><span>Installation</span></a></h1>
<p>npm または yarn から以下の通りインストールできます。</p>
<CodeGroup>
<CodeGroupItem title="npm">
<div class="language-bash" data-ext="sh" data-title="sh"><pre v-pre class="language-bash"><code><span class="token function">npm</span> <span class="token function">install</span> rx-nostr
</code></pre></div></CodeGroupItem>
<CodeGroupItem title="yarn">
<div class="language-bash" data-ext="sh" data-title="sh"><pre v-pre class="language-bash"><code><span class="token function">yarn</span> <span class="token function">add</span> rx-nostr
</code></pre></div></CodeGroupItem>
</CodeGroup>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>Node.js など、トップレベルスコープに <code v-pre>WebSocket</code> コンストラクタが存在しないランタイムで rx-nostr を使用する場合、<code v-pre>createRxNostr()</code> に <code v-pre>WebSocket</code> コンストラクタを渡す必要があります。以下は Node.js で <a href="https://github.com/websockets/ws" target="_blank" rel="noopener noreferrer">ws<ExternalLinkIcon/></a> による WebSocket 実装を利用する例です:</p>
<div class="language-bash" data-ext="sh" data-title="sh"><pre v-pre class="language-bash"><code><span class="token function">npm</span> <span class="token function">install</span> rx-nostr ws
</code></pre></div><div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> WebSocket <span class="token keyword">from</span> <span class="token string">"ws"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  websocketCtor<span class="token operator">:</span> WebSocket<span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div>
</div></template>


