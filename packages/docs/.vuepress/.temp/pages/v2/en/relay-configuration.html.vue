<template><div><h1 id="relay-configuration" tabindex="-1"><a class="header-anchor" href="#relay-configuration"><span>Relay Configuration</span></a></h1>
<p><code v-pre>RxNostr</code> が実際に通信するリレーセットはいくつかの方法で指定できますが、もっとも基本的な方法は <strong>デフォルトリレー</strong> を設定することです。</p>
<h2 id="default-relays" tabindex="-1"><a class="header-anchor" href="#default-relays"><span>Default Relays</span></a></h2>
<p>デフォルトリレーは <code v-pre>rxNostr.setDefaultRelays()</code> を使って設定できる、読み書き権限の指定を伴うリレーのセットです。特に権限を指定しなかった場合には両方が許可されたものとして扱われます。</p>
<p><code v-pre>rxNostr.send()</code> および <code v-pre>rxNostr.use()</code> を後述する一時リレーを指定せずに実行する場合には、ここで登録されたデフォルトリレーが使用されます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
rxNostr<span class="token punctuation">.</span><span class="token function">setDefaultRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span>
  <span class="token string">"wss://nostr1.example.com"</span><span class="token punctuation">,</span>
  <span class="token string">"wss://nostr2.example.com"</span><span class="token punctuation">,</span>
  <span class="token string">"wss://nostr3.example.com"</span><span class="token punctuation">,</span>
<span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><p>権限を指定する場合には以下のようにします:</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code>rxNostr<span class="token punctuation">.</span><span class="token function">setDefaultRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span>
  <span class="token comment">// Readonly</span>
  <span class="token punctuation">{</span>
    url<span class="token operator">:</span> <span class="token string">"wss://nostr1.example.com"</span><span class="token punctuation">,</span>
    read<span class="token operator">:</span> <span class="token boolean">true</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
  <span class="token comment">// Writeonly</span>
  <span class="token punctuation">{</span>
    url<span class="token operator">:</span> <span class="token string">"wss://nostr1.example.com"</span><span class="token punctuation">,</span>
    write<span class="token operator">:</span> <span class="token boolean">true</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
<span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><p>NIP-07 インターフェースが利用できる場合にはその返り値を直接渡すこともできます:</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">await</span> rxNostr<span class="token punctuation">.</span><span class="token function">switchRelays</span><span class="token punctuation">(</span><span class="token keyword">await</span> window<span class="token punctuation">.</span>nostr<span class="token punctuation">.</span><span class="token function">getRelays</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h3 id="reactivity" tabindex="-1"><a class="header-anchor" href="#reactivity"><span>Reactivity</span></a></h3>
<p>デフォルトリレー上での通信は、読み取りについて反応的かつ適応的です。すなわち、デフォルトリレーの変更は現在確立している REQ サブスクリプションに直ちに反映されます。</p>
<p>より詳しく説明すると、今すでにデフォルトリレーの上で REQ サブスクリプションが存在しているとしてデフォルトリレーの構成に変更を加えると、新しいデフォルトリレーのもとではもはや読み取りが許可されなくなったリレーでの REQ は直ちに CLOSE され、逆に新しく読み取りが可能になったリレーに対しては同等の REQ が自動的に送信されます。</p>
<p>デフォルトリレーの変更は、後述する一時リレーの上での通信には影響しません。</p>
<h2 id="temporary-relays" tabindex="-1"><a class="header-anchor" href="#temporary-relays"><span>Temporary Relays</span></a></h2>
<p><code v-pre>rxNostr.send()</code> や <code v-pre>rxNostr.use()</code> などの第二引数に <code v-pre>relays</code> オプションを渡すことによって、<strong>一時リレー</strong> の上で通信することができます。一時リレーは <RouteLink to="/v2/en/connection-strategy.html">Connection Strategy</RouteLink> の設定に関わらず、必要な間だけ接続され不要になると切断されます。</p>
<p>一時リレーの指定はデフォルトリレーにおける権限設定を<strong>尊重しません</strong>。つまり、デフォルトリレーに何が指定されていようと、一時リレーに対して書き込みないし読み取りを実行します。</p>
<h3 id="publish-on-temporary-relays" tabindex="-1"><a class="header-anchor" href="#publish-on-temporary-relays"><span>Publish on Temporary Relays</span></a></h3>
<p><code v-pre>rxNostr.send()</code> の第二引数に <code v-pre>relays</code> オプションを渡すと一時リレーに対してイベントを送信することができます。</p>
<p>一時リレーは書き込みにかかる通信の間、言い換えると EVENT を発行してから OK を受け取るまでの間だけ接続され、それが終わると (ほかのデフォルトリレーや一時リレーとして使われていない限り) 切断されます。</p>
<h3 id="subscribe-on-temporary-relays" tabindex="-1"><a class="header-anchor" href="#subscribe-on-temporary-relays"><span>Subscribe on Temporary Relays</span></a></h3>
<p>読み取りにおける一時リレーは <code v-pre>rxNostr.use()</code> で指定する <strong>use scope</strong> と <code v-pre>rxReq.emit()</code> で指定する <strong>emit scope</strong> の 2 種類が存在し、より狭いスコープの指定 (つまり emit scope) が優先されます。</p>
<p>一時リレーは読み取りにかかる通信の間、言い換えると REQ を発行してから CLOSE されるまでの間だけ接続され、それが終わると (ほかのデフォルトリレーや一時リレーとして使われていない限り) 切断されます。</p>
</div></template>


