<template><div><h1 id="packets" tabindex="-1"><a class="header-anchor" href="#packets" aria-hidden="true">#</a> Packets</h1>
<h2 id="interface" tabindex="-1"><a class="header-anchor" href="#interface" aria-hidden="true">#</a> interface</h2>
<h3 id="req-packet" tabindex="-1"><a class="header-anchor" href="#req-packet" aria-hidden="true">#</a> ReqPacket</h3>
<div class="language-typescript" data-ext="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">type</span> <span class="token class-name">ReqPacket</span> <span class="token operator">=</span> Nostr<span class="token punctuation">.</span>Filter<span class="token punctuation">[</span><span class="token punctuation">]</span> <span class="token operator">|</span> <span class="token keyword">null</span><span class="token punctuation">;</span>
</code></pre></div><h3 id="event-packet" tabindex="-1"><a class="header-anchor" href="#event-packet" aria-hidden="true">#</a> EventPacket</h3>
<div class="language-typescript" data-ext="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">interface</span> <span class="token class-name">EventPacket</span> <span class="token punctuation">{</span>
  from<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">;</span>
  subId<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">;</span>
  event<span class="token operator">:</span> Nostr<span class="token punctuation">.</span>Event<span class="token punctuation">;</span>
<span class="token punctuation">}</span>
</code></pre></div><h3 id="error-packet" tabindex="-1"><a class="header-anchor" href="#error-packet" aria-hidden="true">#</a> ErrorPacket</h3>
<div class="language-typescript" data-ext="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">interface</span> <span class="token class-name">ErrorPacket</span> <span class="token punctuation">{</span>
  from<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">;</span>
  reason<span class="token operator">:</span> <span class="token builtin">unknown</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>
</code></pre></div><h3 id="message-packet" tabindex="-1"><a class="header-anchor" href="#message-packet" aria-hidden="true">#</a> MessagePacket</h3>
<div class="language-typescript" data-ext="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">interface</span> <span class="token class-name">MessagePacket</span> <span class="token punctuation">{</span>
  from<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">;</span>
  message<span class="token operator">:</span> Nostr<span class="token punctuation">.</span>ToClientMessage<span class="token punctuation">.</span>Any<span class="token punctuation">;</span>
<span class="token punctuation">}</span>
</code></pre></div><h3 id="ok-packet" tabindex="-1"><a class="header-anchor" href="#ok-packet" aria-hidden="true">#</a> OkPacket</h3>
<div class="language-typescript" data-ext="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">interface</span> <span class="token class-name">OkPacket</span> <span class="token punctuation">{</span>
  from<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">;</span>
  id<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>
</code></pre></div><h3 id="connection-state-packet" tabindex="-1"><a class="header-anchor" href="#connection-state-packet" aria-hidden="true">#</a> ConnectionStatePacket</h3>
<div class="language-typescript" data-ext="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">interface</span> <span class="token class-name">ConnectionStatePacket</span> <span class="token punctuation">{</span>
  from<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">;</span>
  state<span class="token operator">:</span> ConnectionState<span class="token punctuation">;</span>
<span class="token punctuation">}</span>

<span class="token keyword">type</span> <span class="token class-name">ConnectionState</span> <span class="token operator">=</span>
  <span class="token operator">|</span> <span class="token string">"not-started"</span>
  <span class="token operator">|</span> <span class="token string">"starting"</span>
  <span class="token operator">|</span> <span class="token string">"ongoing"</span>
  <span class="token operator">|</span> <span class="token string">"reconnecting"</span>
  <span class="token operator">|</span> <span class="token string">"error"</span>
  <span class="token operator">|</span> <span class="token string">"terminated"</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


