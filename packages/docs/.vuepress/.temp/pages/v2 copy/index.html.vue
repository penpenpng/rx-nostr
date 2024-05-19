<template><div><h1 id="overview" tabindex="-1"><a class="header-anchor" href="#overview"><span>Overview</span></a></h1>
<p>rx-nostr は <a href="https://nostr.com/" target="_blank" rel="noopener noreferrer">Nostr<ExternalLinkIcon/></a> アプリケーションがひとつまたは複数のリレーとの堅牢な通信を簡便かつ直感的に実現するためのライブラリです。rx-nostr は <a href="https://rxjs.dev/" target="_blank" rel="noopener noreferrer">RxJS<ExternalLinkIcon/></a> で実装されており、RxJS の諸機能とのシームレスな連携が可能となるよう設計されていますが、RxJS との併用は必須ではありません。</p>
<p>Nostr アプリケーションの開発者は rx-nostr を利用することで、リレー通信に伴う以下のような煩わしい問題の存在を意識せず、<a href="https://github.com/nostr-protocol/nips/blob/master/01.md" target="_blank" rel="noopener noreferrer">NIP-01<ExternalLinkIcon/></a> に基づく publish/subscribe を透過的に扱えるようになります。</p>
<ul>
<li><strong>REQ サブスクリプションの管理</strong>:
<ul>
<li>REQ の確立、CLOSE の送出、CLOSED メッセージのハンドリングといった REQ サブスクリプションの管理に必須の低レベルな操作を、より高レベルに抽象化されたインターフェースで取り扱えるようになります。</li>
</ul>
</li>
<li><strong>WebSocket の再接続</strong>:
<ul>
<li>バックオフ戦略に基づいて WebSocket 伝送路の自動再接続を行います。切断時に伝送路から失われた REQ サブスクリプションも自動的に再構成します。</li>
</ul>
</li>
<li><strong>WebSocket 接続の遅延およびアイドリング</strong>:
<ul>
<li>リレーとの WebSocket 接続を本当に必要になるまで遅延させたり、使われなくなった接続を自動で切断することができます。この挙動は設定で無効にもできます。</li>
</ul>
</li>
<li><strong>WebSocket 接続状態のモニタリング</strong>:
<ul>
<li>WebSocket 接続のヘルスステータスを監視できます。アプリケーションはこれをリレーとの接続状況をユーザに通知するインターフェースの構築などに応用できます。</li>
</ul>
</li>
<li><strong>リレープールの管理</strong>:
<ul>
<li>リレーの集合をリアクティブに扱います。デフォルトリレーの増減や Read/Write 設定の変更といったリレー構成の変化に反応して、新しいリレー構成のもとで現在アクティブな REQ を適切に再構成します。</li>
</ul>
</li>
<li><strong>リレーサーバ固有の制約へのフレキシブルな対応</strong>
<ul>
<li><a href="https://github.com/nostr-protocol/nips/blob/master/11.md" target="_blank" rel="noopener noreferrer">NIP-11<ExternalLinkIcon/></a> に基づいて公開されるリレーの同時 REQ サブスクリプション上限に抵触しないよう、リレーへの REQ 要求を適切にキューイングします。</li>
</ul>
</li>
<li><strong>AUTH メッセージの自動ハンドリング</strong>
<ul>
<li><a href="https://github.com/nostr-protocol/nips/blob/master/42.md" target="_blank" rel="noopener noreferrer">NIP-42<ExternalLinkIcon/></a> に基づく AUTH メッセージを自動でハンドリングします。rx-nostr を利用する場合、NIP-42 に対応するためにはオプションを設定するだけで済みます。</li>
</ul>
</li>
<li><strong>署名およびその検証</strong>
<ul>
<li>署名およびその検証を自動で行います。イベントを発行する際に開発者が用意する必要がある情報は、イベントの本質的なコンテンツだけです。</li>
</ul>
</li>
</ul>
<p>rx-nostr を使うと、例えば kind1 のイベントを購読するコードは以下のように簡潔に実現できます。なお、このコードの説明は <RouteLink to="/v2%20copy/getting-started.html">Getting Started</RouteLink> で詳述します。</p>
<div class="language-javascript" data-ext="js" data-title="js"><pre v-pre class="language-javascript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createRxNostr<span class="token punctuation">,</span> createRxForwardReq <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxNostr <span class="token operator">=</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
rxNostr<span class="token punctuation">.</span><span class="token function">setDefaultRelays</span><span class="token punctuation">(</span><span class="token punctuation">[</span><span class="token string">"wss://nostr.example.com"</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> rxReq <span class="token operator">=</span> <span class="token function">createRxForwardReq</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token parameter">packet</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  console<span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">{</span> <span class="token literal-property property">kinds</span><span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">1</span><span class="token punctuation">]</span> <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><div class="custom-container tip"><p class="custom-container-title">Note</p>
<p>本ドキュメントは NIP の、特に NIP-01 に関する基本的な理解を前提に記述されます。これに馴染みのない方は以下に挙げる資料に先に目を通すことをおすすめします。</p>
<ul>
<li><a href="https://github.com/nostr-protocol/nips/blob/master/01.md" target="_blank" rel="noopener noreferrer">NIP-01 (EN)<ExternalLinkIcon/></a></li>
<li><a href="https://github.com/nostr-jp/nips-ja/blob/main/01.md" target="_blank" rel="noopener noreferrer">NIP-01 (JA)<ExternalLinkIcon/></a></li>
</ul>
</div>
</div></template>


