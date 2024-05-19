<template><div><h1 id="req-strategy" tabindex="-1"><a class="header-anchor" href="#req-strategy"><span>REQ Strategy</span></a></h1>
<p><strong>REQ Strategy</strong> は <code v-pre>RxNostr</code> が <code v-pre>ReqPacket</code> をどのように取り扱うか、または <code v-pre>EventPacket</code> をどのように発行するかを定める読み取り専用の値で、<code v-pre>RxReq</code> オブジェクトごとに割り当てられています。<code v-pre>rxNostr.use(rxReq)</code> が呼び出された際に <code v-pre>RxNostr</code> は <code v-pre>rxReq.strategy</code> を読み取り、その値に応じて REQ の戦略を決定します。</p>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>NIP-01 に定義される <a href="https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions" target="_blank" rel="noopener noreferrer">Subscription<ExternalLinkIcon/></a> と <code v-pre>rxNostr.use()</code> が返す <code v-pre>unsubscribe()</code> 可能なオブジェクトという意味での <code v-pre>Subscription</code> との混同を防ぐため、本ドキュメントではそれぞれを <strong>REQ サブスクリプション</strong> / <strong>Rx サブスクリプション</strong> と表記することがあります。実際、後者は厳密に RxJS における <a href="https://rxjs.dev/guide/subscription" target="_blank" rel="noopener noreferrer"><code v-pre>Subscription</code><ExternalLinkIcon/></a> と一致します。</p>
</div>
<h2 id="forward-strategy" tabindex="-1"><a class="header-anchor" href="#forward-strategy"><span>Forward Strategy</span></a></h2>
<p>Forward Strategy はこれから発行されるであろう未来のイベントを待ち受けるための戦略です。<code v-pre>createRxForwardReq()</code> によって生成された <code v-pre>RxReq</code> がこの戦略に基づきます。この戦略のもとでは</p>
<ul>
<li>各 <code v-pre>ReqPacket</code> はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古い REQ サブスクリプションは上書きされ、<strong>常にひとつ以下の REQ サブスクリプションを保持します。</strong></li>
<li><strong>REQ サブスクリプションは自動では CLOSE されません。</strong> 以下のいずれかの明示的な操作がされたときに限って CLOSE されます。
<ul>
<li>Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> される。</li>
<li><code v-pre>RxNostr</code> が明示的に <code v-pre>dispose()</code> される。</li>
</ul>
</li>
</ul>
<div class="custom-container tip"><p class="custom-container-title">TIP</p>
<p>過去のイベントの重複した取得を避けるため、2 回目以降に送出する <code v-pre>ReqPacket</code> は <code v-pre>since</code> や <code v-pre>limit</code> を調整すると良いでしょう。</p>
</div>
<h2 id="backward-strategy" tabindex="-1"><a class="header-anchor" href="#backward-strategy"><span>Backward Strategy</span></a></h2>
<p>Backward Strategy は既に発行された過去のイベントを取得するための戦略です。<code v-pre>createRxBackwardReq()</code> によって生成された <code v-pre>RxReq</code> がこの戦略に基づきます。この戦略のもとでは</p>
<ul>
<li>各 <code v-pre>ReqPacket</code> は互いに異なる subId を持つ REQ サブスクリプションを確立します。つまり、<strong>複数の REQ サブスクリプションが同時に並行する可能性があります。</strong></li>
<li>REQ サブスクリプションは次のいずれかの場合に<strong>自動的に CLOSE されます。</strong>
<ul>
<li>EOSE message を受け取る。</li>
<li>EVENT message を受け取れない状態が一定時間継続する。</li>
<li>Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> される。</li>
<li><code v-pre>RxNostr</code> が明示的に <code v-pre>dispose()</code> される。</li>
</ul>
</li>
</ul>
<div class="custom-container warning"><p class="custom-container-title">WARNING</p>
<p>Backward Strategy はすべての REQ が EOSE を返すことを期待して動作するため、<code v-pre>ReqPacket</code> は未来のイベントを捕捉しないよう <code v-pre>until</code> などを工夫するべきです。</p>
<p>さもなければ、Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> されるまで REQ サブスクリプションが残り続ける可能性があります。</p>
</div>
<h3 id="over" tabindex="-1"><a class="header-anchor" href="#over"><span>over()</span></a></h3>
<p>Backward Strategy に基づいて複数の REQ を発行するとき、それらすべての REQ の完了を待つことができると便利な場合があります。<code v-pre>rxReq.over()</code> はそのような場合に Backward Strategy でのみ利用できる機能です。</p>
<p><code v-pre>rxReq.over()</code> は同 <code v-pre>rxReq</code> の上でこれ以上 <code v-pre>rxReq.emit()</code> が呼ばれないことを rx-nostr に伝えます。<code v-pre>rxReq.over()</code> が呼び出されたあと、すでに送出されたすべての <code v-pre>ReqPacket</code> に関連する EOSE が確認されたときに、<code v-pre>rxNostr.use()</code> は<strong>完了</strong>します (すでにすべての EOSE が確認されているならば直ちに完了します)。完了時の処理は以下のようにして登録できます:</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">const</span> rxReq <span class="token operator">=</span> <span class="token function">createRxBackwardReq</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  <span class="token function-variable function">next</span><span class="token operator">:</span> <span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token string">"Received:"</span><span class="token punctuation">,</span> packet<span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
  <span class="token function-variable function">complete</span><span class="token operator">:</span> <span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token string">"Completed!"</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">{</span> ids<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">"..."</span><span class="token punctuation">]</span> <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
rxReq<span class="token punctuation">.</span><span class="token function">over</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><p>なお、ここでの「完了」とは RxJS における Observable の complete とまったく同一の概念です。Forward Strategy に基づく Observable が complete することは (<code v-pre>RxNostr</code> が <code v-pre>dispose()</code> された場合を除いて) ありません。</p>
</div></template>


