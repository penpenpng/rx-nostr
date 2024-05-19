<template><div><h1 id="other-observables" tabindex="-1"><a class="header-anchor" href="#other-observables"><span>Other Observables</span></a></h1>
<p>rx-nostr には他にもいくつか <code v-pre>subscribe()</code> 可能なオブジェクトがあります。</p>
<div class="custom-container tip"><p class="custom-container-title">RxJS Tips</p>
<p>これらはすべて RxJS の Observable です。明示的に <code v-pre>rxNostr.dispose()</code> が呼ばれるまで complete せず、<code v-pre>unsubscribe()</code> を呼ばれても何も起こりません。</p>
</div>
<h2 id="createallmessageobservable" tabindex="-1"><a class="header-anchor" href="#createallmessageobservable"><span>createAllMessageObservable()</span></a></h2>
<p><code v-pre>rxNostr.createAllMessageObservable()</code> によって、リレーから送られてきた (未知のタイプのメッセージを含む) すべてのメッセージを監視できます。</p>
<h2 id="createallmessageobservable-1" tabindex="-1"><a class="header-anchor" href="#createallmessageobservable-1"><span>createAllMessageObservable()</span></a></h2>
<p><code v-pre>rxNostr.createAllMessageObservable()</code> によって、リレーから送られてきたすべての EVENT メッセージを監視できます。</p>
<h2 id="createallerrorobservable" tabindex="-1"><a class="header-anchor" href="#createallerrorobservable"><span>createAllErrorObservable()</span></a></h2>
<p><code v-pre>rxNostr.createAllErrorObservable()</code> によってエラーを監視することができます。典型的には、これらはリレーが不正な JSON を返したときに発生するエラーです。</p>
<div class="custom-container tip"><p class="custom-container-title">RxJS Tips</p>
<p><code v-pre>rxNostr.use()</code> が返す Observable は error で終了しません。これは、どこかひとつのリレーに起因するエラーによって Observable 全体が停止しないようにするためです。</p>
</div>
</div></template>


