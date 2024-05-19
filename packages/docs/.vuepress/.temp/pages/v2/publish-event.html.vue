<template><div><h1 id="publish-event" tabindex="-1"><a class="header-anchor" href="#publish-event"><span>Publish EVENT</span></a></h1>
<p><code v-pre>RxNostr</code> の <code v-pre>send()</code> メソッドを通じて EVENT メッセージを送信することができます。</p>
<p><code v-pre>send()</code> の第一引数は <code v-pre>kind</code> と <code v-pre>content</code> のみが必須で残りが省略可能な event オブジェクトです。指定されたパラメータは指定された値が (たとえ不正な値だったとしても) 尊重されます。一方、指定されなかったパラメータは、特に <code v-pre>pubkey</code>, <code v-pre>id</code>, <code v-pre>sig</code> が <code v-pre>signer</code> によって計算されます。</p>
<p><code v-pre>signer</code> は <code v-pre>createRxNostr()</code> のオプションか、<code v-pre>send()</code> の第二引数で渡すことができる署名器です。<code v-pre>signer</code> が両方で指定された場合は <code v-pre>send()</code> の第二引数に渡したものが使われます。通常の利用では <code v-pre>createRxNostr()</code> のオプションに渡しておくのがいいでしょう。</p>
<div class="language-typescript line-numbers-mode" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> seckeySigner <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  <span class="token comment">// nsec1... 形式と HEX 形式のどちらを渡しても動作します。</span>
  signer<span class="token operator">:</span> <span class="token function">seckeySigner</span><span class="token punctuation">(</span><span class="token string">"nsec1..."</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
rxNostr<span class="token punctuation">.</span><span class="token function">setDefaultRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span><span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">send</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  kind<span class="token operator">:</span> <span class="token number">1</span><span class="token punctuation">,</span>
  content<span class="token operator">:</span> <span class="token string">"Hello, Nostr!"</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>デフォルトの <code v-pre>signer</code> は <code v-pre>nip07Signer()</code> です。これはランタイムから <a href="https://github.com/nostr-protocol/nips/blob/master/07.md" target="_blank" rel="noopener noreferrer">NIP-07</a> インターフェースを探し、それを利用して必要な値を計算します。</p>
</div>
<p>実際に送信される event オブジェクトの <code v-pre>id</code> や <code v-pre>pubkey</code> に興味がある場合もあるかもしれません。そのときは <code v-pre>signer</code> を使って自分で計算することもできます。</p>
<div class="language-typescript line-numbers-mode" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> seckeySigner <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> signer <span class="token operator">=</span> <span class="token function">seckeySigner</span><span class="token punctuation">(</span><span class="token string">"nsec1..."</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  signer<span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
rxNostr<span class="token punctuation">.</span><span class="token function">setDefaultRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span><span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> eventParams <span class="token operator">=</span> <span class="token punctuation">{</span>
  kind<span class="token operator">:</span> <span class="token number">1</span><span class="token punctuation">,</span>
  content<span class="token operator">:</span> <span class="token string">"Hello, Nostr!"</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">;</span>
<span class="token keyword">const</span> event <span class="token operator">=</span> <span class="token keyword">await</span> signer<span class="token punctuation">.</span><span class="token function">signEvent</span><span class="token punctuation">(</span>eventParams<span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">send</span><span class="token punctuation">(</span>event<span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> id <span class="token operator">=</span> event<span class="token punctuation">.</span>id<span class="token punctuation">;</span>
<span class="token comment">// event.pubkey と同じ値になります。</span>
<span class="token keyword">const</span> pubkey <span class="token operator">=</span> <span class="token keyword">await</span> signer<span class="token punctuation">.</span><span class="token function">getPublicKey</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">`</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>pubkey<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> は </span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>id<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> を送信しました。</span><span class="token template-punctuation string">`</span></span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="handling-ok-messages" tabindex="-1"><a class="header-anchor" href="#handling-ok-messages"><span>Handling OK Messages</span></a></h2>
<p><code v-pre>send()</code> の返り値は <code v-pre>subscribe()</code> 可能なオブジェクトです。これを <code v-pre>subscribe()</code> することで、OK メッセージを待ち受けることができます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code>rxNostr<span class="token punctuation">.</span><span class="token function">send</span><span class="token punctuation">(</span>event<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span>
    <span class="token template-string"><span class="token template-punctuation string">`</span><span class="token string">リレー </span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>from<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> への送信が </span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>ok <span class="token operator">?</span> <span class="token string">"成功"</span> <span class="token operator">:</span> <span class="token string">"失敗"</span><span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> しました。</span><span class="token template-punctuation string">`</span></span>
  <span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><div class="custom-container warning"><p class="custom-container-title">WARNING</p>
<p>EVENT 送信の過程で <a href="https://github.com/nostr-protocol/nips/blob/master/42.md" target="_blank" rel="noopener noreferrer">NIP-42</a> に基づく AUTH を求められた場合、rx-nostr は AUTH の後に EVENT メッセージを自動で再送します。このシナリオでは同一のリレーから 2 つの OK メッセージを受け取りうることに注意してください。あるリレーから OK メッセージを受け取ったとき、2 回目の OK メッセージが届きうるかを確かめるには <code v-pre>packet.done</code> が <code v-pre>false</code> であることを確認します。</p>
</div>
<div class="custom-container tip"><p class="custom-container-title">RxJS Tips</p>
<p><code v-pre>send()</code> の返り値は厳密には Observable です。この Observable は OK メッセージがこれ以上届き得ないと判断された時点で complete します。また、まだ OK メッセージが届き得るにも関わらず何も届かないまま 30 秒が経過したときには error で終了します。この待ち時間は <code v-pre>createRxNostr()</code> の <code v-pre>okTimeout</code> オプションで変更できます。</p>
</div>
</div></template>


