<template><div><h1 id="subscribe-event" tabindex="-1"><a class="header-anchor" href="#subscribe-event"><span>Subscribe EVENT</span></a></h1>
<p><code v-pre>RxNostr</code> の <code v-pre>use()</code> メソッドを通じて EVENT メッセージを購読することができます。</p>
<p>EVENT メッセージ購読までの大まかな流れは次の通りです:</p>
<ol>
<li><code v-pre>createRxNostr()</code> で <code v-pre>RxNostr</code> オブジェクトを得る</li>
<li><code v-pre>createRxForwardReq()</code> または <code v-pre>createRxBackwardReq()</code> で <code v-pre>RxReq</code> オブジェクトを得る</li>
<li><code v-pre>rxNostr.use(rxReq).subscribe(callback)</code> で EVENT メッセージ受信時の処理を登録しつつ、<code v-pre>Subscription</code> オブジェクトを得る</li>
<li><code v-pre>rxReq.emit(filter)</code> で REQ メッセージを発行する</li>
<li>購読が不要になったら <code v-pre>subscription.unsubscribe()</code> して購読を終了する</li>
</ol>
<p><RouteLink to="/v2/ja/getting-started.html">Getting Started</RouteLink> ではこの流れを具体的なコードとともに説明しているので参考にしてください。</p>
<p><code v-pre>createRxForwardReq()</code> と <code v-pre>createRxBackwardReq()</code> の動作の違いは REQ Strategy によって決定づけられます。</p>
<h2 id="req-strategy" tabindex="-1"><a class="header-anchor" href="#req-strategy"><span>REQ Strategy</span></a></h2>
<p><strong>REQ Strategy</strong> は <code v-pre>RxNostr</code> が <code v-pre>ReqPacket</code> をどのように取り扱うか、または <code v-pre>EventPacket</code> をどのように発行するかを定める読み取り専用の値で、<code v-pre>RxReq</code> オブジェクトごとに割り当てられています。<code v-pre>rxNostr.use(rxReq)</code> が呼び出された際に <code v-pre>RxNostr</code> は <code v-pre>rxReq.strategy</code> を読み取り、その値に応じて REQ の戦略を決定します。</p>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>NIP-01 に定義される <a href="https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions" target="_blank" rel="noopener noreferrer">Subscription<ExternalLinkIcon/></a> と <code v-pre>rxNostr.use()</code> が返す <code v-pre>unsubscribe()</code> 可能なオブジェクトという意味での <code v-pre>Subscription</code> との混同を防ぐため、本ドキュメントではそれぞれを <strong>REQ サブスクリプション</strong> / <strong>Rx サブスクリプション</strong> と表記することがあります。実際、後者は RxJS における <a href="https://rxjs.dev/guide/subscription" target="_blank" rel="noopener noreferrer"><code v-pre>Subscription</code><ExternalLinkIcon/></a> と厳密に一致します。</p>
</div>
<h3 id="forward-strategy" tabindex="-1"><a class="header-anchor" href="#forward-strategy"><span>Forward Strategy</span></a></h3>
<p>Forward Strategy はこれから発行されるであろう未来のイベントを待ち受けるための戦略です。<code v-pre>createRxForwardReq()</code> によって生成された <code v-pre>RxReq</code> がこの戦略に基づきます。この戦略のもとでは</p>
<ul>
<li>各 <code v-pre>ReqPacket</code> はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古い REQ サブスクリプションは上書きされ、<strong>常にひとつ以下の REQ サブスクリプションを保持します。</strong></li>
<li>REQ サブスクリプションは次のいずれかの場合に CLOSE されます。
<ul>
<li>Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> される。</li>
<li>AUTH 要求以外の理由で CLOSED メッセージを受け取る。</li>
<li><code v-pre>RxNostr</code> が明示的に <code v-pre>dispose()</code> される。</li>
</ul>
</li>
</ul>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>過去のイベントの重複した取得を避けるため、2 回目以降に送出する <code v-pre>ReqPacket</code> は <code v-pre>since</code> や <code v-pre>limit</code> を調整すると良いでしょう。</p>
</div>
<h3 id="backward-strategy" tabindex="-1"><a class="header-anchor" href="#backward-strategy"><span>Backward Strategy</span></a></h3>
<p>Backward Strategy は既に発行された過去のイベントを取得するための戦略です。<code v-pre>createRxBackwardReq()</code> によって生成された <code v-pre>RxReq</code> がこの戦略に基づきます。この戦略のもとでは</p>
<ul>
<li>各 <code v-pre>ReqPacket</code> は互いに異なる subId を持つ REQ サブスクリプションを確立します。つまり、<strong>複数の REQ サブスクリプションが同時に並行する可能性があります。</strong></li>
<li>REQ サブスクリプションは次のいずれかの場合に CLOSE されます。
<ul>
<li><strong>EOSE メッセージを受け取る。</strong></li>
<li><strong>EVENT メッセージを受け取れない状態が一定時間継続する。</strong></li>
<li>Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> される。</li>
<li>AUTH 要求以外の理由で CLOSED メッセージを受け取る。</li>
<li><code v-pre>RxNostr</code> が明示的に <code v-pre>dispose()</code> される。</li>
</ul>
</li>
</ul>
<div class="custom-container warning"><p class="custom-container-title">WARNING</p>
<p>Backward Strategy はすべての REQ が EOSE を返すことを期待して動作するため、<code v-pre>ReqPacket</code> は未来のイベントを捕捉しないよう <code v-pre>until</code> などを工夫するべきです。</p>
<p>さもなければ、Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> されるまで REQ サブスクリプションが残り続ける可能性があります。</p>
</div>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>デフォルトでは EVENT メッセージ が受け取れない状態が 30 秒継続したときに CLOSE されます。この時間は <code v-pre>createRxNostr()</code> の <code v-pre>eoseTimeout</code> オプションで変更できます。</p>
</div>
<h4 id="over" tabindex="-1"><a class="header-anchor" href="#over"><span>over()</span></a></h4>
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
</code></pre></div><div class="custom-container tip"><p class="custom-container-title">RxJS Tips</p>
<p>ここでの <strong>完了</strong> とは RxJS における Observable の complete とまったく同一の概念です。Forward Strategy に基づく Observable が complete することは (<code v-pre>RxNostr</code> が <code v-pre>dispose()</code> された場合を除いて) ありません。</p>
</div>
<h2 id="req-queue" tabindex="-1"><a class="header-anchor" href="#req-queue"><span>REQ Queue</span></a></h2>
<p>通常、リレーには同時並行できる REQ サブスクリプションの数に上限が設けられており、<a href="https://github.com/nostr-protocol/nips/blob/master/11.md" target="_blank" rel="noopener noreferrer">NIP-11<ExternalLinkIcon/></a> に基づきその上限設定が公開されます。rx-nostr はこの情報を自動で読み取って、並行数の制限を逸脱しないように REQ 要求をキューイングします。</p>
<p>詳しくは <RouteLink to="/v2/ja/nip11-registry.html">NIP-11 Registry</RouteLink> を参照してください。</p>
</div></template>


