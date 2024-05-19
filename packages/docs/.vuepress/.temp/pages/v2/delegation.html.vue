<template><div><h1 id="delegation" tabindex="-1"><a class="header-anchor" href="#delegation"><span>Delegation</span></a></h1>
<p>rx-nostr は <a href="https://github.com/nostr-protocol/nips/blob/master/26.md" target="_blank" rel="noopener noreferrer">NIP-26</a> に基づくイベントの委任に対応しています。</p>
<h2 id="publish-deleteged-events" tabindex="-1"><a class="header-anchor" href="#publish-deleteged-events"><span>Publish Deleteged Events</span></a></h2>
<p><code v-pre>delegateSigner()</code> を利用すると委任されたイベントを発行できます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> delegateSigner<span class="token punctuation">,</span> nsecSigner <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> signer <span class="token operator">=</span> <span class="token function">delegateSigner</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  delegateeSigner<span class="token operator">:</span> <span class="token function">seckeySigner</span><span class="token punctuation">(</span>seckeyChild<span class="token punctuation">)</span><span class="token punctuation">,</span>
  delegatorSeckey<span class="token operator">:</span> seckeyRoot<span class="token punctuation">,</span>
  allowedKinds<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">,</span> <span class="token number">1</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
  allowedSince<span class="token operator">:</span> <span class="token number">777777</span><span class="token punctuation">,</span>
  allowedUntil<span class="token operator">:</span> <span class="token number">888888</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><p><code v-pre>allowed...</code> フィールドは単に委任文字列を作るためだけに用いられます。すなわち、<code v-pre>delegateSigner()</code> による署名器は委任条件外のイベントも生成することができます。</p>
<p>もし委任条件の検証を行いたい場合は <code v-pre>validateDelegation()</code> が利用できます。</p>
<h2 id="subscribe-delegated-events" tabindex="-1"><a class="header-anchor" href="#subscribe-delegated-events"><span>Subscribe Delegated Events</span></a></h2>
<p><code v-pre>acceptDelegatedEvent</code> オプションを有効化すると、委任されたイベントを購読できるようになります (リレーが NIP-26 に基づくクエリに対応している必要があります)。</p>
<p><code v-pre>acceptDelegatedEvent</code> の設定に関わらず、<code v-pre>EventPacket</code> はそのイベントの「ルート公開鍵」が何であるかを示す <code v-pre>rootPubkey</code> フィールドを公開しています。このフィールドは、イベントが委任されていれば委任元の公開鍵と、委任されていなければイベントの発行元の公開鍵と等しいです。</p>
<p><RouteLink to="/v2/auto-filtering.html#auto-validation">Auto Validation</RouteLink> も参照してください。</p>
</div></template>


