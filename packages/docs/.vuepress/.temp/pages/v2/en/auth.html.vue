<template><div><h1 id="auth" tabindex="-1"><a class="header-anchor" href="#auth"><span>AUTH</span></a></h1>
<p><code v-pre>createRxNostr()</code> の <code v-pre>authenticator</code> オプションを設定すると、rx-nostr は<a href="https://github.com/nostr-protocol/nips/blob/master/42.md" target="_blank" rel="noopener noreferrer">NIP-42<ExternalLinkIcon/></a> に基づく AUTH メッセージを自動でハンドリングするようになります。</p>
<p>もっともシンプルな設定は <code v-pre>authenticator: &quot;auto&quot;</code> です。これは <code v-pre>RxNostr</code> に与えられた <code v-pre>signer</code> を使用して AUTH メッセージに応答します。ほとんどのユースケースではこの設定で十分のはずです。</p>
<div class="language-typescript line-numbers-mode" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">{</span> authenticator<span class="token operator">:</span> <span class="token string">"auto"</span> <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>より高度なユースケースに対応するため、<code v-pre>authenticator</code> は <code v-pre>signer</code> をオプションに取ることができます。これにより、通常のイベント発行時とは異なる署名器を用いて AUTH メッセージを作成できます:</p>
<div class="language-typescript line-numbers-mode" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> nsecSigner <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  signer<span class="token operator">:</span> <span class="token function">nsecSigner</span><span class="token punctuation">(</span><span class="token string">"nsec1aaa..."</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
  authenticator<span class="token operator">:</span> <span class="token punctuation">{</span>
    signer<span class="token operator">:</span> <span class="token function">nsecSigner</span><span class="token punctuation">(</span><span class="token string">"nsec1bbb..."</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>また、リレーごとに異なる署名器を使いたい場合のために、関数形式の指定も可能です。例えば以下の例では、<code v-pre>wss://nostr.example.com</code> でのみ AUTH メッセージに応答し、他のリレーでは AUTH を無視します:</p>
<div class="language-typescript line-numbers-mode" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> nsecSigner <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  <span class="token function-variable function">authenticator</span><span class="token operator">:</span> <span class="token punctuation">(</span>relayUrl<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token keyword">if</span> <span class="token punctuation">(</span>relayUrl <span class="token operator">===</span> <span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
      <span class="token keyword">return</span> <span class="token string">"auto"</span><span class="token punctuation">;</span>
    <span class="token punctuation">}</span> <span class="token keyword">else</span> <span class="token punctuation">{</span>
      <span class="token keyword">return</span> <span class="token keyword">undefined</span><span class="token punctuation">;</span>
    <span class="token punctuation">}</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div></div></template>


