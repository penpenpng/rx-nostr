<template><div><h1 id="connection-strategy" tabindex="-1"><a class="header-anchor" href="#connection-strategy"><span>Connection Strategy</span></a></h1>
<p><strong>Connection Strategy</strong> は rx-nostr が WebSocket 通信をどのタイミングで確立し、いつ切断するのかを決定づける戦略です。Connection Strategy はデフォルトリレーの上でのみ有効で、Connection Strategy の設定に関わらず、一時リレーへの接続はそれが不要になった時点で直ちに切断されます。</p>
<p>Connection Strategy は <code v-pre>createRxNostr()</code> の <code v-pre>connectionStrategy</code> オプションで指定でき、デフォルトは <strong>Lazy Strategy</strong> です。</p>
<h2 id="lazy-strategy" tabindex="-1"><a class="header-anchor" href="#lazy-strategy"><span>Lazy Strategy</span></a></h2>
<p><strong>Lazy Strategy</strong> はすべてのデフォルトリレーを一時リレーのように扱います。つまり、そのリレーへの通信が必要になったタイミングで初めて接続し、不要になったタイミングで直ちに切断します。</p>
<h2 id="lazy-keep-strategy" tabindex="-1"><a class="header-anchor" href="#lazy-keep-strategy"><span>Lazy-Keep Strategy</span></a></h2>
<p><strong>Lazy-Keep Strategy</strong> は Lazy Strategy と同様に必要になったタイミングで接続しますが、それがデフォルトリレーとして指定されている限りは切断しません。そのリレーがデフォルトリレーから外されたのち、不要になったタイミングで初めて切断します。</p>
<h2 id="aggressive-strategy" tabindex="-1"><a class="header-anchor" href="#aggressive-strategy"><span>Aggressive Strategy</span></a></h2>
<p><strong>Aggressive Strategy</strong> はそれがデフォルトリレーとして指定されたときに直ちに接続し、デフォルトリレーである限りは切断しません。Lazy-Keep Strategy と同様に、そのリレーがデフォルトリレーから外されたのち、不要になったタイミングで初めて切断します。</p>
</div></template>


