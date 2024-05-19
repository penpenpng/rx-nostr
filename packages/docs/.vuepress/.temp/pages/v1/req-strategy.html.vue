<template><div><h1 id="req-strategy" tabindex="-1"><a class="header-anchor" href="#req-strategy"><span>REQ Strategy</span></a></h1>
<div class="custom-container danger"><p class="custom-container-title">Caution</p>
<p>このドキュメントは rx-nostr 1.x のものです。2.x のドキュメントは<RouteLink to="/v2/">こちら</RouteLink>を参照してください。</p>
</div>
<p><strong>REQ Strategy</strong> は <code v-pre>RxNostr</code> が <code v-pre>ReqPacket</code> をどのように取り扱うか、または <code v-pre>EventPacket</code> をどのように発行するかを定める読み取り専用の値で、<code v-pre>RxReq</code> オブジェクトごとに割り当てられています。<code v-pre>rxNostr.use(rxReq)</code> が呼び出された際に <code v-pre>RxNostr</code> は <code v-pre>rxReq.strategy</code> を読み取り、その値に応じて REQ の戦略を決定します。</p>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>NIP-01 に定義される <a href="https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions" target="_blank" rel="noopener noreferrer">Subscription</a> と RxJS 上の概念としての <a href="https://rxjs.dev/guide/subscription" target="_blank" rel="noopener noreferrer">Subscription</a> の混同を防ぐため、本ドキュメントではそれぞれを <strong>REQ サブスクリプション</strong> / <strong>Rx サブスクリプション</strong> と表記することがあります。</p>
</div>
<h2 id="forward-strategy" tabindex="-1"><a class="header-anchor" href="#forward-strategy"><span>Forward Strategy</span></a></h2>
<p>Forward Strategy はこれから発行されるであろう未来のイベントを待ち受けるための戦略です。<code v-pre>createRxForwardReq()</code> によって生成された <code v-pre>RxReq</code> がこの戦略に基づきます。この戦略のもとでは</p>
<ul>
<li>各 <code v-pre>ReqPacket</code> はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古い REQ サブスクリプションは上書きされ、常にひとつ以下の REQ サブスクリプションを保持します。</li>
<li>Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> されるまで、REQ サブスクリプションは CLOSE されません。</li>
</ul>
<div class="custom-container tip"><p class="custom-container-title">TIP</p>
<p>過去のイベントの重複した取得を避けるため、2 回目以降に送出する <code v-pre>ReqPacket</code> は <code v-pre>since</code> や <code v-pre>limit</code> を調整すると良いでしょう。</p>
</div>
<h2 id="backward-strategy" tabindex="-1"><a class="header-anchor" href="#backward-strategy"><span>Backward Strategy</span></a></h2>
<p>Backward Strategy は既に発行された過去のイベントを取得するための戦略です。<code v-pre>createRxBackwardReq()</code> によって生成された <code v-pre>RxReq</code> がこの戦略に基づきます。この戦略のもとでは</p>
<ul>
<li>各 <code v-pre>ReqPacket</code> は互いに異なる subId を持つ REQ サブスクリプションを確立します。</li>
<li>REQ サブスクリプションは次のいずれかの場合に CLOSE されます。
<ul>
<li>EOSE message を受け取る。</li>
<li>EVENT message を受け取れない状態が一定時間継続する。</li>
<li>Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> する。</li>
</ul>
</li>
</ul>
<div class="custom-container warning"><p class="custom-container-title">WARNING</p>
<p>Backward Strategy はすべての REQ が有限のイベントを返すことを期待して動作するため、<code v-pre>ReqPacket</code> は未来のイベントを捕捉しないよう <code v-pre>until</code> などを工夫するべきです。</p>
<p>さもなければ、稀ですが、リレーが EOSE message をサポートしていない場合、Rx サブスクリプションが明示的に <code v-pre>unsubscribe()</code> されるまで REQ サブスクリプションが残り続ける可能性があります。</p>
</div>
<h2 id="oneshot-strategy" tabindex="-1"><a class="header-anchor" href="#oneshot-strategy"><span>Oneshot Strategy</span></a></h2>
<p>Oneshot Strategy は Backward Strategy と同じく既に発行された過去のイベントを取得するための戦略ですが、<code v-pre>ReqPacket</code> をひとつしか送出することができません。その代わり、最初の REQ サブスクリプションが CLOSE したとき Observable が complete します。 <code v-pre>rxNostr.use()</code> が返す <code v-pre>Observable&lt;EventPacket&gt;</code> が (<code v-pre>rxNostr.dispose()</code> が呼ばれる以外の理由で) complete する戦略はこれだけです。この戦略は必要なデータの読み込みが完了したときに何かを実行したい場合に便利です。</p>
<p><code v-pre>createRxOneshotReq()</code> によって生成された <code v-pre>RxReq</code> がこの戦略に基づきます。</p>
</div></template>


