<template><div><h1 id="overview" tabindex="-1"><a class="header-anchor" href="#overview" aria-hidden="true">#</a> Overview</h1>
<p>rx-nostr は <a href="https://nostr.com/" target="_blank" rel="noopener noreferrer">Nostr<ExternalLinkIcon/></a> アプリケーションがリレーとより簡単に通信するための <a href="https://rxjs.dev/" target="_blank" rel="noopener noreferrer">RxJS<ExternalLinkIcon/></a> に基づくライブラリです。Nostr アプリケーションの開発者が考慮を迫られる以下のような煩わしい課題を肩代わりし、開発者がアプリケーションロジックに集中する手助けをします。</p>
<ul>
<li><strong>REQ サブスクリプションの管理</strong>: REQ の確立および更新、あるいは自動的な CLOSE を初めとした REQ サブスクリプションの管理を簡潔なインターフェースで実現します。</li>
<li><strong>リレープールの管理</strong>: リレーの集合をリアクティブに扱います。リレーの増減や Read/Write 設定の変更といったリレー構成の変化に反応して、新しいリレー構成のもとで現在アクティブな REQ を適切に再構成します。</li>
<li><strong>WebSocket 接続の管理</strong>: WebSocket の自動再接続と、それに伴う必要に応じた REQ の再発行を行います。接続状態の変化を購読することも可能で、アプリケーションが接続しているリレー集合のヘルスステータスを簡単に確認できるようにします。</li>
</ul>
<p>rx-nostr を使うと、例えば kind1 のイベントを購読するコードは以下のように簡潔に実現できます。なお、これと同等のコードの説明は <RouterLink to="/guide/first-step.html">First Step</RouterLink> で詳述します。より複雑な例は <RouterLink to="/guide/examples.html">Examples</RouterLink> で見ることができます。</p>
<div class="language-javascript" data-ext="js"><pre v-pre class="language-javascript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> createRxForwardReq <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
rxNostr<span class="token punctuation">.</span><span class="token function">switchRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span><span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxReq <span class="token operator">=</span> <span class="token function">createRxForwardReq</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token parameter">packet</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  console<span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">[</span><span class="token punctuation">{</span> <span class="token literal-property property">kinds</span><span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">1</span><span class="token punctuation">]</span> <span class="token punctuation">}</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><p>また、rx-nostr は RxJS 以外のフレームワークに依存しません。これは rx-nostr を任意のフロンエンドフレームと組み合わせて Web フロントエンドアプリケーションに利用することも、あるいは任意の Node.js ライブラリと組み合わせて bot や CLI アプリケーションを構築することも可能であることを意味します。</p>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>本ドキュメントは Nostr と RxJS に関する基本的な知識を前提として記述されます。これらについて馴染みのない方は先に次に挙げる資料に目を通すことをおすすめします。</p>
<ul>
<li><a href="https://github.com/nostr-protocol/nips" target="_blank" rel="noopener noreferrer">NIPs<ExternalLinkIcon/></a></li>
<li><a href="https://rxjs.dev/guide/overview" target="_blank" rel="noopener noreferrer">RxJS Introduction<ExternalLinkIcon/></a></li>
</ul>
</div>
</div></template>


