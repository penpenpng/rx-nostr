<template><div><h1 id="core-concept" tabindex="-1"><a class="header-anchor" href="#core-concept" aria-hidden="true">#</a> Core Concept</h1>
<p>rx-nostr の中心となるのは <RouterLink to="/api/rx-nostr.html"><code v-pre>RxNostr</code></RouterLink> と <RouterLink to="/api/rx-req.html"><code v-pre>RxReq</code></RouterLink> の 2 種類のオブジェクトです。<code v-pre>RxNostr</code> は <code v-pre>RxReq</code> が提供する <a href="https://rxjs.dev/guide/observable" target="_blank" rel="noopener noreferrer">Observable<ExternalLinkIcon/></a> を <code v-pre>subscribe()</code> し、あなたのプログラムは <code v-pre>RxNostr</code> が提供する Observable を <code v-pre>subscribe()</code> します。これらの Observable の中を流れるオブジェクトを Packet と呼びます。この関係は概ね次の図で表現できます:</p>
<div class="language-text line-numbers-mode" data-ext="text"><pre v-pre class="language-text"><code>[RxReq] --(REQ Packet)--> +-------+ --(EVENT Packet)--> +------------+
[RxReq] --(REQ Packet)--> |RxNostr| --(EVENT Packet)--> |Your Program|
[RxReq] --(REQ Packet)--> +-------+ --(EVENT Packet)--> +------------+
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>この関係は <code v-pre>RxNostr</code> の <code v-pre>use()</code> メソッドによって確立され、その戻り値を <code v-pre>subscribe()</code> することで初めて駆動し、さらにそれを <code v-pre>unsubscribe()</code> することで解消されます。</p>
<div class="language-javascript line-numbers-mode" data-ext="js"><pre v-pre class="language-javascript"><code><span class="token keyword">const</span> observable <span class="token operator">=</span> rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token keyword">const</span> sub <span class="token operator">=</span> observable<span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
sub<span class="token punctuation">.</span><span class="token function">unsubscribe</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>上で与えられた関係図の中で、<code v-pre>RxNostr</code> の役割は <code v-pre>RxReq</code> から受け取った Packet に応じた REQ サブスクリプションを別途与えられたリレーセットの上で確立することと、その REQ サブスクリプションから得られた EVENT を Packet に包んであなたのプログラムに提供することです。典型的なアプリケーションでは <code v-pre>RxNostr</code> のインスタンスはただひとつ存在することになるでしょう。</p>
<p>一方、<code v-pre>RxReq</code> の役割は REQ Filter を Packet に包んで <code v-pre>RxNostr</code> に送信するための <code v-pre>emit()</code> メソッドを公開することと、<code v-pre>RxNostr</code> に対して REQ の管理戦略を通知することです。2 つ目の役割で述べた管理戦略のことを Strategy と呼び、Backward Strategy と Forward Strategy の 2 種類が定義されています。</p>
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


