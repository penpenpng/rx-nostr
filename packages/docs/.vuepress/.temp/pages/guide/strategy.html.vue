<template><div><h1 id="strategy" tabindex="-1"><a class="header-anchor" href="#strategy" aria-hidden="true">#</a> Strategy</h1>
<h2 id="backward-strategy" tabindex="-1"><a class="header-anchor" href="#backward-strategy" aria-hidden="true">#</a> Backward Strategy</h2>
<p>Backward Strategy は既に発行された過去の EVENT を取得するための戦略です。この戦略のもとでは、</p>
<ul>
<li><code v-pre>RxNostr</code> に対して送信された各 Packet は互いに異なる subId を持つ REQ サブスクリプションを確立します</li>
<li>各 REQ サブスクリプションは以下のいずれかの場合に CLOSE されます
<ul>
<li>EOSE に達する</li>
<li>何も EVENT を受けとならない状態が一定時間継続する</li>
<li>明示的に <code v-pre>unsubscribe()</code> される</li>
</ul>
</li>
</ul>
<p>Backward Strategy はすべての REQ に「終わり」があることを期待して動作するため、Filter は未来のイベントを捕捉しないように注意して設定する必要があります。さもなければ、特に EOSE をリレーが発行しなかった場合、明示的に CLOSE されるまでサブスクリプションが残り続ける可能性があります。</p>
<h2 id="forward-strategy" tabindex="-1"><a class="header-anchor" href="#forward-strategy" aria-hidden="true">#</a> Forward Strategy</h2>
<p>Forward Strategy はこれから発行されるであろう未来の EVENT を待ち受けるための戦略です。この戦略のもとでは、</p>
<ul>
<li><code v-pre>RxNostr</code> に対して送信された各 Packet はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古いサブスクリプションは上書きされ、常にひとつ以下のサブスクリプションを保持します。</li>
<li>REQ サブスクリプションは明示的に <code v-pre>unsubscribe()</code> まで CLOSE されません</li>
</ul>
<p>過去のイベントの重複した取得を避けるため、2 回目以降に <code v-pre>emit()</code> される Filter の <code v-pre>limit</code> はできるだけ小さくすべきです。</p>
</div></template>


