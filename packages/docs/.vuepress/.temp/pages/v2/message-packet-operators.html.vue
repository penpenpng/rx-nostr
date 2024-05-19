<template><div><h1 id="messagepacket-operators" tabindex="-1"><a class="header-anchor" href="#messagepacket-operators"><span>MessagePacket Operators</span></a></h1>
<p><code v-pre>rxNostr.createAllMessageObservable()</code> が返す <code v-pre>Observable&lt;MessagePacket&gt;</code> に対して適用可能な Operator のリファレンスです。</p>
<nav class="table-of-contents"><ul><li><router-link to="#filterbytype">filterByType()</router-link></li></ul></nav>
<h2 id="filterbytype" tabindex="-1"><a class="header-anchor" href="#filterbytype"><span>filterByType()</span></a></h2>
<p>与えられたタイプ (すなわち <code v-pre>&quot;EVENT&quot;</code>, <code v-pre>&quot;EOSE&quot;</code>, <code v-pre>&quot;OK&quot;</code> など) に合致するメッセージのみ抽出し、ほかを排除します。TypeScript において、このフィルターは型ガードのように機能します。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> filterByType <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">createAllMessageObservable</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">filterByType</span><span class="token punctuation">(</span><span class="token string">"AUTH"</span><span class="token punctuation">)</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token comment">// ...</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


