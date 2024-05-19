<template><div><h1 id="reconnection" tabindex="-1"><a class="header-anchor" href="#reconnection"><span>Reconnection</span></a></h1>
<p>WebSocket が予期しない理由で切断されたとき、rx-nostr は自動で再接続を試みます。この挙動は <code v-pre>createRxNostr()</code> の <code v-pre>retry</code> オプションで変更できます。デフォルトでは <a href="https://aws.amazon.com/jp/blogs/architecture/exponential-backoff-and-jitter/" target="_blank" rel="noopener noreferrer">exponential backoff and jitter</a> 戦略に従って 5 回までの再接続を試行します。</p>
<p>WebSocket が再接続されたとき、古い接続の中で継続中だった通信は自動で復旧されます。すなわち:</p>
<ul>
<li>REQ が再発行されます。これに伴って過去に受信した EVENT メッセージを再度受信する可能性があります。</li>
<li>まだ OK を確認できていない送信済み EVENT メッセージがあった場合、再度送信されます。</li>
</ul>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>WebSocket 接続がステータスコード 4000 によって切断された場合、自動再接続は行われません。これは<a href="https://github.com/nostr-protocol/nips/commit/0ba4589550858bb86ed533f90054bfc642aa5350" target="_blank" rel="noopener noreferrer">既に廃止された古い NIP-01 仕様</a>への後方互換性のためです。</p>
</div>
<h2 id="lazy-since-until" tabindex="-1"><a class="header-anchor" href="#lazy-since-until"><span>Lazy since/until</span></a></h2>
<p>WebSocket の再接続に伴って REQ が再発行されるとき、過去に発行した REQ とまったく同一の REQ を再度発行するのは望ましくない場合があります。</p>
<p>例えば、現在よりも「未来」の投稿を購読するために <code v-pre>{ since: Math.floor(Date.now() / 1000) }</code> フィルターを送信したとします。この購読が有効なうちに WebSocket の再接続が発生するとリレーには再度まったく同じ REQ が送信されますが、これはつまり再接続時点から見て「過去」のイベントをリレーに要求することを意味しており、期待に反します。</p>
<p>この問題に対応するため、<code v-pre>rxReq.emit()</code> は Nostr 標準の Filter オブジェクトの代わりに独自の <code v-pre>LazyFilter</code> 型を許容しています。<code v-pre>LazyFilter</code> は <code v-pre>since</code> または <code v-pre>until</code> に数値の代わりに <code v-pre>() =&gt; number</code> 型の関数も受け入れる Filter です。<code v-pre>since</code>/<code v-pre>until</code> に関数を渡した場合、リレーに実際に送信される <code v-pre>since</code>/<code v-pre>until</code> の値は送信の直前に評価されます。</p>
<p>先の例では、<code v-pre>{ since: Math.floor(Date.now() / 1000) }</code> の代わりに <code v-pre>{ since: () =&gt; Math.floor(Date.now() / 1000) }</code> を指定すると、再接続時点であらためて <code v-pre>since</code> が評価され、常に「未来」のイベントを購読できます。rx-nostr はこのユースケースのために便利な <code v-pre>now</code> ユーティリティを公開しています。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> createRxForwardReq<span class="token punctuation">,</span> now <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
rxNostr<span class="token punctuation">.</span><span class="token function">setDefaultRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span><span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxReq <span class="token operator">=</span> <span class="token function">createRxForwardReq</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token builtin">console</span><span class="token punctuation">.</span>log<span class="token punctuation">)</span><span class="token punctuation">;</span>

rxReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">{</span> kinds<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">1</span><span class="token punctuation">]</span><span class="token punctuation">,</span> since<span class="token operator">:</span> now <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


