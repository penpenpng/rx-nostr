<template><div><h1 id="monitoring-connections" tabindex="-1"><a class="header-anchor" href="#monitoring-connections"><span>Monitoring Connections</span></a></h1>
<p><code v-pre>RxNostr</code> が抱えている WebSocket 接続の状況 (<code v-pre>ConnectionState</code>) は <code v-pre>createConnectionStateObservable()</code> を通じて監視することができます。
このメソッドの戻り値は <code v-pre>ConnectionState</code> が変化したときに Packet を発行する Observable です。</p>
<p><code v-pre>ConnectionState</code> は以下のいずれかの値を取ります。</p>
<table>
<thead>
<tr>
<th style="text-align:left"><code v-pre>ConnectionState</code></th>
<th style="text-align:left">description</th>
</tr>
</thead>
<tbody>
<tr>
<td style="text-align:left"><code v-pre>not-started</code></td>
<td style="text-align:left">初期状態。リレー構成変更後に読み取りが不要になった接続もこの状態に戻ります。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>starting</code></td>
<td style="text-align:left">接続中。<code v-pre>not-started</code> からこの状態に遷移します。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>ongoing</code></td>
<td style="text-align:left">正常稼働中。ただし必要な通信がない場合には内部的に close されている可能性があります。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>reconnecting</code></td>
<td style="text-align:left">再接続中。backoff 設定が構成されていてかつ予期しない理由で接続が中断されたときに、 <code v-pre>ongoing</code> からこの状態に遷移します。そうでなければ、この状態をスキップして <code v-pre>error</code> に遷移します。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>error</code></td>
<td style="text-align:left">規定の回数リトライしてなお再接続に失敗したとき、<code v-pre>reconnecting</code> からこの状態に遷移します。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>rejected</code></td>
<td style="text-align:left">WebSocket がコード 4000 で終了したとき、再接続を試行せずにこの状態に遷移します。これは <a href="https://github.com/nostr-protocol/nips/blob/fab6a21a779460f696f11169ddf343b437327592/01.md?plain=1#L113" target="_blank" rel="noopener noreferrer">NIP-01 が推奨する<ExternalLinkIcon/></a>挙動です。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>terminated</code></td>
<td style="text-align:left">終了状態。<code v-pre>rxNostr.dispose()</code> が呼び出されたときのみこの状態に遷移します。もう接続を利用することはできません。</td>
</tr>
</tbody>
</table>
<p>WebSocket 接続が <code v-pre>error</code> または <code v-pre>rejected</code> に至った場合、<code v-pre>rxNostr.reconnect()</code> を使用して再接続を試みることができます。</p>
<div class="language-javascript" data-ext="js" data-title="js"><pre v-pre class="language-javascript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> delay<span class="token punctuation">,</span> filter <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rxjs"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">createConnectionStateObservable</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span>
    <span class="token comment">// When an error packet is received, ...</span>
    <span class="token function">filter</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token parameter">packet</span><span class="token punctuation">)</span> <span class="token operator">=></span> packet<span class="token punctuation">.</span>state <span class="token operator">===</span> <span class="token string">"error"</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
    <span class="token comment">// Wait one minute.</span>
    <span class="token function">delay</span><span class="token punctuation">(</span><span class="token number">60</span> <span class="token operator">*</span> <span class="token number">1000</span><span class="token punctuation">)</span>
  <span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token parameter">packet</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    rxNostr<span class="token punctuation">.</span><span class="token function">reconnect</span><span class="token punctuation">(</span>packet<span class="token punctuation">.</span>from<span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


