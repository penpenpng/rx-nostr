<template><div><h1 id="operators" tabindex="-1"><a class="header-anchor" href="#operators"><span>Operators</span></a></h1>
<p>rx-nostr の各所に存在する Observable は純粋な RxJS の Observable インスタンスなので、<a href="https://rxjs.dev/guide/operators" target="_blank" rel="noopener noreferrer">operator<ExternalLinkIcon/></a> を適用することができます。<code v-pre>RxReq</code> だけは Observable の他に REQ Strategy 等の情報を保持するためこれそのものは Observable インスタンスではないのですが、RxJS の <code v-pre>observable.pipe()</code> と完全な互換性を持つ <code v-pre>pipe()</code> メソッドを備えているので、やはり同様に operator を適用することができます。</p>
<p>rx-nostr が提供する operator はもちろんのこと、RxJS が提供する強力な operator の力を借りることも可能です。以下はその一例です。より多くの例は <RouteLink to="/docs/v1/examples.html">Examples</RouteLink> を参照してください。</p>
<div class="language-javascript line-numbers-mode" data-ext="js" data-title="js"><pre v-pre class="language-javascript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> throttleTime <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rxjs"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> createRxForwardReq<span class="token punctuation">,</span> verify<span class="token punctuation">,</span> uniq <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token keyword">await</span> rxNostr<span class="token punctuation">.</span><span class="token function">switchRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span><span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxReq <span class="token operator">=</span> <span class="token function">createRxForwardReq</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span>
    <span class="token comment">// cf. https://rxjs.dev/api/index/function/throttleTime</span>
    <span class="token function">throttleTime</span><span class="token punctuation">(</span><span class="token number">1000</span><span class="token punctuation">)</span>
  <span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span>
    <span class="token comment">// Verify event hash and signature</span>
    <span class="token function">verify</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
    <span class="token comment">// Uniq by event hash</span>
    <span class="token function">uniq</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
  <span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span>console<span class="token punctuation">.</span>log<span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> authors <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token punctuation">]</span><span class="token punctuation">;</span>
<span class="token keyword">const</span> <span class="token function-variable function">addAuthor</span> <span class="token operator">=</span> <span class="token punctuation">(</span><span class="token parameter">author</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  authors<span class="token punctuation">.</span><span class="token function">push</span><span class="token punctuation">(</span>author<span class="token punctuation">)</span><span class="token punctuation">;</span>
  rxReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">{</span> <span class="token literal-property property">kinds</span><span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">1</span><span class="token punctuation">]</span><span class="token punctuation">,</span> authors <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">;</span>

<span class="token comment">// For example, even if a large amount of author pubkey is brought</span>
<span class="token comment">// in from another REQ in a short period of time, they will be throttled.</span>

<span class="token function">addAuthor</span><span class="token punctuation">(</span><span class="token string">"PUBKEY1"</span><span class="token punctuation">)</span><span class="token punctuation">;</span> <span class="token comment">// This may be published,</span>
<span class="token function">addAuthor</span><span class="token punctuation">(</span><span class="token string">"PUBKEY2"</span><span class="token punctuation">)</span><span class="token punctuation">;</span> <span class="token comment">// but this will be ignored.</span>
<span class="token function">addAuthor</span><span class="token punctuation">(</span><span class="token string">"PUBKEY3"</span><span class="token punctuation">)</span><span class="token punctuation">;</span> <span class="token comment">// ditto.</span>
<span class="token function">addAuthor</span><span class="token punctuation">(</span><span class="token string">"PUBKEY4"</span><span class="token punctuation">)</span><span class="token punctuation">;</span> <span class="token comment">// same.</span>

<span class="token comment">// One second later an REQ will be published</span>
<span class="token comment">// to subscribe to kind1 by all pubkeys PUBKEY1-4.</span>
</code></pre><div class="highlight-lines"><br><br><br><br><br><br><br><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><br><br><br><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><div class="highlight-line">&nbsp;</div><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br></div><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div></div></template>


