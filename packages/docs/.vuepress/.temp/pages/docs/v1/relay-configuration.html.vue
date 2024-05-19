<template><div><h1 id="relay-configuration" tabindex="-1"><a class="header-anchor" href="#relay-configuration"><span>Relay Configuration</span></a></h1>
<p><code v-pre>RxNostr</code> が実際に通信するリレーセットは <code v-pre>rxNostr.switchRelays()</code> を使って構成できます。</p>
<div class="language-javascript" data-ext="js" data-title="js"><pre v-pre class="language-javascript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token keyword">await</span> rxNostr<span class="token punctuation">.</span><span class="token function">switchRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span>
  <span class="token string">"wss://nostr1.example.com"</span><span class="token punctuation">,</span>
  <span class="token string">"wss://nostr2.example.com"</span><span class="token punctuation">,</span>
  <span class="token string">"wss://nostr3.example.com"</span><span class="token punctuation">,</span>
<span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><p>上の例のように <code v-pre>rxNostr.switchRelays()</code> に単に WebSocket エンドポイントの URL を渡した場合、それらのリレーに対して <strong>読み取り</strong> と <strong>書き込み</strong> が両方許可されたものとして扱われます。ここで、読み取りとは <code v-pre>RxReq</code> オブジェクトを通じた REQ メッセージから始まる一連の双方向通信を、書き込みとは <code v-pre>rxNostr.send()</code> メソッドを通じた EVENT メッセージの送信から始まる一連の双方向通信を指します。</p>
<p>特定のリレーに対して読み取りまたは書き込みのいずれかのみを許可したい場合、<code v-pre>rxNostr.switchRelays()</code> の引数にオブジェクトのリストを渡すことができます。</p>
<div class="language-javascript" data-ext="js" data-title="js"><pre v-pre class="language-javascript"><code><span class="token keyword">await</span> rxNostr<span class="token punctuation">.</span><span class="token function">switchRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span>
  <span class="token punctuation">{</span>
    <span class="token literal-property property">url</span><span class="token operator">:</span> <span class="token string">"wss://nostr1.example.com"</span><span class="token punctuation">,</span>
    <span class="token literal-property property">read</span><span class="token operator">:</span> <span class="token boolean">true</span><span class="token punctuation">,</span>
    <span class="token literal-property property">write</span><span class="token operator">:</span> <span class="token boolean">false</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
  <span class="token punctuation">{</span>
    <span class="token literal-property property">url</span><span class="token operator">:</span> <span class="token string">"wss://nostr2.example.com"</span><span class="token punctuation">,</span>
    <span class="token literal-property property">read</span><span class="token operator">:</span> <span class="token boolean">false</span><span class="token punctuation">,</span>
    <span class="token literal-property property">write</span><span class="token operator">:</span> <span class="token boolean">true</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
  <span class="token punctuation">{</span>
    <span class="token literal-property property">url</span><span class="token operator">:</span> <span class="token string">"wss://nostr3.example.com"</span><span class="token punctuation">,</span>
    <span class="token literal-property property">read</span><span class="token operator">:</span> <span class="token boolean">true</span><span class="token punctuation">,</span>
    <span class="token literal-property property">write</span><span class="token operator">:</span> <span class="token boolean">true</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
<span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><p>NIP-07 インターフェースが存在するブラウザ環境下では <code v-pre>window.nostr.getRelays()</code> の引数をそのまま使うこともできます。</p>
<div class="language-javascript" data-ext="js" data-title="js"><pre v-pre class="language-javascript"><code><span class="token keyword">await</span> rxNostr<span class="token punctuation">.</span><span class="token function">switchRelays</span><span class="token punctuation">(</span><span class="token keyword">await</span> window<span class="token punctuation">.</span>nostr<span class="token punctuation">.</span><span class="token function">getRelays</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="reactivity" tabindex="-1"><a class="header-anchor" href="#reactivity"><span>Reactivity</span></a></h2>
<p>リレー構成の変更は、現在確立している REQ サブスクリプションに直ちに反映されます。すなわち、新しい構成のもとでもはや読み取りが許可されなくなったリレーにおける REQ は即座に CLOSE され、逆に新しく読み取りが可能になったリレーに対しては同等の REQ が自動的に送信されます。</p>
<h2 id="auto-reconnection" tabindex="-1"><a class="header-anchor" href="#auto-reconnection"><span>Auto Reconnection</span></a></h2>
<p>WebSocket が予期しない理由で切断されたとき、rx-nostr は <a href="https://aws.amazon.com/jp/blogs/architecture/exponential-backoff-and-jitter/" target="_blank" rel="noopener noreferrer">exponential backoff and jitter<ExternalLinkIcon/></a> 戦略に従って自動で再接続を試みます。この挙動は <code v-pre>createRxNostr()</code> のオプションで変更できます。</p>
<h2 id="read-on-a-subset-of-relays-v1-1-0" tabindex="-1"><a class="header-anchor" href="#read-on-a-subset-of-relays-v1-1-0"><span>Read on a subset of relays (v1.1.0+)</span></a></h2>
<p>構成された読み取り可能リレーのうちの一部だけで REQ サブスクリプションを確立したい場合、<code v-pre>rxNostr.use()</code> の <code v-pre>scope</code> オプションにリレーの URL のリストを指定できます。
<code v-pre>scope</code> オプションに URL を指定しても、指定された URL が構成されていない場合には読み取りは発生しないことに注意してください。</p>
<div class="language-javascript" data-ext="js" data-title="js"><pre v-pre class="language-javascript"><code><span class="token keyword">await</span> rxNostr<span class="token punctuation">.</span><span class="token function">switchRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span>
  <span class="token string">"wss://nostr1.example.com"</span><span class="token punctuation">,</span>
  <span class="token string">"wss://nostr2.example.com"</span><span class="token punctuation">,</span>
<span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// - `wss://nostr1.example.com` will be used.</span>
<span class="token comment">// - `wss://unknown.example.com` and `wss://not-yet.example.com`</span>
<span class="token comment">//   will not be used because it is not in the configuration.</span>
rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">,</span> <span class="token punctuation">{</span>
  <span class="token literal-property property">scope</span><span class="token operator">:</span> <span class="token punctuation">[</span>
    <span class="token string">"wss://nostr1.example.com"</span><span class="token punctuation">,</span>
    <span class="token string">"wss://unknown.example.com"</span><span class="token punctuation">,</span>
    <span class="token string">"wss://not-yet.example.com"</span><span class="token punctuation">,</span>
  <span class="token punctuation">]</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// `addRelay()` is a wrapper of `switchRelays()`.</span>
<span class="token comment">// This is equivalent to:</span>
<span class="token comment">//   `rxNostr.switchRelays([...rxNostr.getRelays(), 'wss://not-yet.example.com'])`</span>
<span class="token keyword">await</span> rxNostr<span class="token punctuation">.</span><span class="token function">addRelay</span><span class="token punctuation">(</span><span class="token string">"wss://not-yet.example.com"</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// Now `wss://not-yet.example.com` is available.</span>
rxReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span>filters<span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


