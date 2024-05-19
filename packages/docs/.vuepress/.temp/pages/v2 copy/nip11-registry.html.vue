<template><div><h1 id="nip-11-registry" tabindex="-1"><a class="header-anchor" href="#nip-11-registry"><span>NIP-11 Registry</span></a></h1>
<p><RouteLink to="/v2%20copy/subscribe-event.html#req-queue">REQ Queue</RouteLink> で説明した通り、rx-nostr はリレーの制約を尊重して動作するために NIP-11 に関連する情報を自動で取得します。この動作は <code v-pre>createRxNostr()</code> の <code v-pre>skipFetchNip11</code> オプションで無効にできます。</p>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>今のところ、rx-nostr が動作の最適化のために利用する情報は <code v-pre>limitation.max_subscriptions</code> のみです。</p>
</div>
<p>rx-nostr が扱う NIP-11 情報は <code v-pre>Nip11Registry</code> に集約されます。<code v-pre>Nip11Registry</code> は公開されており、開発者はこのクラスが提供する静的メソッドを通じて NIP-11 情報にアクセスできます。</p>
<h2 id="get-nip-11-info" tabindex="-1"><a class="header-anchor" href="#get-nip-11-info"><span>Get NIP-11 info</span></a></h2>
<p>rx-nostr によってすでに取得された NIP-11 情報のキャッシュは <code v-pre>Nip11Registry.get()</code> で取得できます。</p>
<h2 id="fetch-nip-11-info-manually" tabindex="-1"><a class="header-anchor" href="#fetch-nip-11-info-manually"><span>Fetch NIP-11 info manually</span></a></h2>
<p><code v-pre>Nip11Registry.fetch()</code> によって手動で NIP-11 を取得することもできます。このようにして一度取得された情報は、たとえ <code v-pre>skipFetchNip11</code> が設定されていたとしても、rx-nostr が動作の最適化のために利用できます。</p>
<h2 id="set-default-nip-11-info" tabindex="-1"><a class="header-anchor" href="#set-default-nip-11-info"><span>Set Default NIP-11 info</span></a></h2>
<p>特別な事情 (例えばテストなど) によって <code v-pre>skipFetchNip11</code> を設定した場合や、そもそもリレーが NIP-11 をサポートしていなかった場合のために、<code v-pre>Nip11Registry.setDefault()</code> を使ってデフォルトの NIP-11 情報を設定することができます。</p>
<p>例えば、以下のように設定すると、rx-nostr は NIP-11 情報を取得できなかった際には <code v-pre>limitation.max_subscriptions</code> が <code v-pre>10</code> であるものとして振る舞います。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> Nip11Registry <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

Nip11Registry<span class="token punctuation">.</span><span class="token function">setDefault</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  limitation<span class="token operator">:</span> <span class="token punctuation">{</span>
    max_subscriptions<span class="token operator">:</span> <span class="token number">10</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="set-nip-11-info-manually" tabindex="-1"><a class="header-anchor" href="#set-nip-11-info-manually"><span>Set NIP-11 info manually</span></a></h2>
<p>NIP-11 をサポートしていない特定のリレーのために NIP-11 情報を手動で設定することもできます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> Nip11Registry <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

Nip11Registry<span class="token punctuation">.</span><span class="token function">set</span><span class="token punctuation">(</span><span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">,</span> <span class="token punctuation">{</span>
  limitation<span class="token operator">:</span> <span class="token punctuation">{</span>
    max_subscriptions<span class="token operator">:</span> <span class="token number">10</span><span class="token punctuation">,</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div></div></template>


