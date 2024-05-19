<template><div><h1 id="rxnostr" tabindex="-1"><a class="header-anchor" href="#rxnostr" aria-hidden="true">#</a> RxNostr</h1>
<h2 id="create-rx-nostr" tabindex="-1"><a class="header-anchor" href="#create-rx-nostr" aria-hidden="true">#</a> createRxNostr()</h2>
<div class="language-typescript" data-ext="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">function</span> <span class="token function">createRxNostr</span><span class="token punctuation">(</span>options<span class="token operator">?</span><span class="token operator">:</span> Partial<span class="token operator">&lt;</span>RxNostrOptions<span class="token operator">></span><span class="token punctuation">)</span><span class="token operator">:</span> RxNostr<span class="token punctuation">;</span>

<span class="token keyword">interface</span> <span class="token class-name">RxNostrOptions</span> <span class="token punctuation">{</span>
  retry<span class="token operator">:</span> <span class="token builtin">number</span><span class="token punctuation">;</span>
  timeout<span class="token operator">:</span> <span class="token builtin">number</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>
</code></pre></div><h2 id="get-relays" tabindex="-1"><a class="header-anchor" href="#get-relays" aria-hidden="true">#</a> RxNostr#getRelays()</h2>
<h4 id="switch-relays" tabindex="-1"><a class="header-anchor" href="#switch-relays" aria-hidden="true">#</a> switchRelays()</h4>
<h4 id="add-relay" tabindex="-1"><a class="header-anchor" href="#add-relay" aria-hidden="true">#</a> addRelay()</h4>
<h4 id="remove-relay" tabindex="-1"><a class="header-anchor" href="#remove-relay" aria-hidden="true">#</a> removeRelay()</h4>
<h4 id="has-relay" tabindex="-1"><a class="header-anchor" href="#has-relay" aria-hidden="true">#</a> hasRelay()</h4>
<h4 id="get-all-relay-state" tabindex="-1"><a class="header-anchor" href="#get-all-relay-state" aria-hidden="true">#</a> getAllRelayState()</h4>
<h4 id="get-relay-state" tabindex="-1"><a class="header-anchor" href="#get-relay-state" aria-hidden="true">#</a> getRelayState()</h4>
<h4 id="reconnect" tabindex="-1"><a class="header-anchor" href="#reconnect" aria-hidden="true">#</a> reconnect()</h4>
<h4 id="use" tabindex="-1"><a class="header-anchor" href="#use" aria-hidden="true">#</a> use()</h4>
<h4 id="create-all-event-observable" tabindex="-1"><a class="header-anchor" href="#create-all-event-observable" aria-hidden="true">#</a> createAllEventObservable()</h4>
<h4 id="create-all-error-observable" tabindex="-1"><a class="header-anchor" href="#create-all-error-observable" aria-hidden="true">#</a> createAllErrorObservable()</h4>
<h4 id="create-all-message-observable" tabindex="-1"><a class="header-anchor" href="#create-all-message-observable" aria-hidden="true">#</a> createAllMessageObservable()</h4>
<h4 id="createconnectionstateobservable" tabindex="-1"><a class="header-anchor" href="#createconnectionstateobservable" aria-hidden="true">#</a> createConnectionStateObservable()</h4>
<h4 id="send" tabindex="-1"><a class="header-anchor" href="#send" aria-hidden="true">#</a> send()</h4>
<h4 id="dispose" tabindex="-1"><a class="header-anchor" href="#dispose" aria-hidden="true">#</a> dispose()</h4>
</div></template>


