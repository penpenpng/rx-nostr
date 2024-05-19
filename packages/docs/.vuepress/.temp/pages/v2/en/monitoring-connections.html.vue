<template><div><h1 id="monitoring-connections" tabindex="-1"><a class="header-anchor" href="#monitoring-connections"><span>Monitoring Connections</span></a></h1>
<p><code v-pre>RxNostr</code> が抱えている WebSocket 接続の状況 (<code v-pre>ConnectionState</code>) は <code v-pre>rxNostr.createConnectionStateObservable()</code> を通じて監視することができます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">createConnectionStateObservable</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">`</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>from<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> の接続状況が </span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>state<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> に変化しました。</span><span class="token template-punctuation string">`</span></span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><div class="custom-container tip"><p class="custom-container-title">RxJS Tips</p>
<p>このメソッドの戻り値は <code v-pre>ConnectionState</code> が変化したときに Packet を発行する <code v-pre>Observable&lt;ConnectionStatePacket&gt;</code> です。</p>
</div>
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
<td style="text-align:left"><code v-pre>initialized</code></td>
<td style="text-align:left">初期状態。接続の準備は完了しているがまだ一度も接続は試みられていない。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>connecting</code></td>
<td style="text-align:left">自動再接続以外の理由で接続を試みている。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>connected</code></td>
<td style="text-align:left">接続状態。通信が可能な唯一の状態。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>waiting-for-retrying</code></td>
<td style="text-align:left">再接続待機中。再接続が必要だが、バックオフ戦略に基づいて待機している。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>retrying</code></td>
<td style="text-align:left">再接続を試みている。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>dormant</code></td>
<td style="text-align:left">休眠中。通信が不要になったので一時的に切断している。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>error</code></td>
<td style="text-align:left">エラー終了。規定の回数再接続を試行したが接続に失敗した。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>rejected</code></td>
<td style="text-align:left">エラー終了。WebSocket がコード 4000 で終了したため、再接続は試行されなかった。</td>
</tr>
<tr>
<td style="text-align:left"><code v-pre>terminated</code></td>
<td style="text-align:left">終了状態。<code v-pre>rxNostr.dispose()</code> が呼び出されたためすべてのリソースを破棄した。</td>
</tr>
</tbody>
</table>
<p>WebSocket 接続が <code v-pre>error</code> または <code v-pre>rejected</code> に至った場合、<code v-pre>rxNostr.reconnect()</code> を使用して再接続を試みることができます。以下は <code v-pre>error</code> で終了した 1 分後に再接続を試みる例です:</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> delay<span class="token punctuation">,</span> filter <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rxjs"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">createConnectionStateObservable</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span>
    <span class="token comment">// When an error packet is received, ...</span>
    <span class="token function">filter</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> packet<span class="token punctuation">.</span>state <span class="token operator">===</span> <span class="token string">"error"</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
    <span class="token comment">// Wait one minute.</span>
    <span class="token function">delay</span><span class="token punctuation">(</span><span class="token number">60</span> <span class="token operator">*</span> <span class="token number">1000</span><span class="token punctuation">)</span>
  <span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    rxNostr<span class="token punctuation">.</span><span class="token function">reconnect</span><span class="token punctuation">(</span>packet<span class="token punctuation">.</span>from<span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


