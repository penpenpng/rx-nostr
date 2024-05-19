<template><div><h1 id="reqpacket-operators" tabindex="-1"><a class="header-anchor" href="#reqpacket-operators"><span>ReqPacket Operators</span></a></h1>
<p><code v-pre>rxReq</code> に対して適用可能な Operator のリファレンスです。</p>
<nav class="table-of-contents"><ul><li><router-link to="#batch">batch()</router-link></li><li><router-link to="#chunk">chunk()</router-link></li></ul></nav>
<h2 id="batch" tabindex="-1"><a class="header-anchor" href="#batch"><span>batch()</span></a></h2>
<p><code v-pre>ReqPacket[]</code> の Observable を、<code v-pre>mergeFilter</code> パラメータに基づいて <code v-pre>ReqPacket</code> の Observable に変換します。<a href="https://rxjs.dev/api/operators/bufferTime" target="_blank" rel="noopener noreferrer"><code v-pre>bufferTime()</code><ExternalLinkIcon/></a>と併用すると便利です。</p>
<p><code v-pre>mergeFilter</code> パラメータが省略された場合、フィルターは単に結合されます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> bufferTime <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rxjs"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> <span class="token punctuation">{</span> batch<span class="token punctuation">,</span> latestEach<span class="token punctuation">,</span> now <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

<span class="token comment">// kind1 のタイムラインを観測し続ける forward REQ</span>
<span class="token keyword">const</span> timelineReq <span class="token operator">=</span> <span class="token function">createRxForwardReq</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// 必要に応じて kind0 を収集する backward REQ</span>
<span class="token keyword">const</span> profileReq <span class="token operator">=</span> <span class="token function">createRxBackwardReq</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>timelineReq<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token keyword">const</span> event <span class="token operator">=</span> packet<span class="token punctuation">.</span>event<span class="token punctuation">;</span>

  <span class="token comment">// タイムラインに現れたユーザの kind0 を取得</span>
  profileReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
    kinds<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
    authors<span class="token operator">:</span> <span class="token punctuation">[</span>event<span class="token punctuation">.</span>pubkey<span class="token punctuation">]</span><span class="token punctuation">,</span>
    limit<span class="token operator">:</span> <span class="token number">1</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// 短い間に大量の REQ が発行されないように、1 秒毎に REQ をまとめ上げて発行</span>
<span class="token keyword">const</span> batchedReq <span class="token operator">=</span> profileReq<span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">bufferTime</span><span class="token punctuation">(</span><span class="token number">1000</span><span class="token punctuation">)</span><span class="token punctuation">,</span> <span class="token function">batch</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>batchedReq<span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">latestEach</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> packet<span class="token punctuation">.</span>event<span class="token punctuation">.</span>pubkey<span class="token punctuation">)</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token string">"kind0"</span><span class="token punctuation">,</span> packet<span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

timelineReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">{</span> kinds<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">1</span><span class="token punctuation">]</span><span class="token punctuation">,</span> since<span class="token operator">:</span> now <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="chunk" tabindex="-1"><a class="header-anchor" href="#chunk"><span>chunk()</span></a></h2>
<p><code v-pre>ReqPacket</code> を必要に応じていくつかの <code v-pre>ReqPacket</code> に分割します。</p>
<p>今のところ rx-nostr は NIP-11 に定められる <code v-pre>max_filters</code> を自動で尊重することができないので、大量のフィルターを指定した REQ が発行され得る場合には <code v-pre>chunk()</code> を利用する必要があります。</p>
<p>第一引数は分割が必要かどうかを判定する <code v-pre>predicate</code> で、第二引数は分割の方法を指定する <code v-pre>toChunks</code> です。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> chunk <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> chunkedReq <span class="token operator">=</span> rxReq<span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span>
  <span class="token function">chunk</span><span class="token punctuation">(</span>
    <span class="token punctuation">(</span>filters<span class="token punctuation">)</span> <span class="token operator">=></span> filters<span class="token punctuation">.</span>length <span class="token operator">></span> <span class="token number">100</span><span class="token punctuation">,</span>
    <span class="token punctuation">(</span>filters<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
      <span class="token keyword">const</span> pile <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token operator">...</span>filters<span class="token punctuation">]</span><span class="token punctuation">;</span>
      <span class="token keyword">const</span> chunks <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token punctuation">]</span><span class="token punctuation">;</span>

      <span class="token keyword">while</span> <span class="token punctuation">(</span>pile<span class="token punctuation">.</span>length <span class="token operator">></span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
        chunks<span class="token punctuation">.</span><span class="token function">push</span><span class="token punctuation">(</span>pile<span class="token punctuation">.</span><span class="token function">splice</span><span class="token punctuation">(</span><span class="token number">0</span><span class="token punctuation">,</span> <span class="token number">100</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
      <span class="token punctuation">}</span>

      <span class="token keyword">return</span> chunks<span class="token punctuation">;</span>
    <span class="token punctuation">}</span>
  <span class="token punctuation">)</span>
<span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>chunkedReq<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token comment">// ...</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


