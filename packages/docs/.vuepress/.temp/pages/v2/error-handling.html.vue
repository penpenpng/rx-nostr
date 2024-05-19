<template><div><h1 id="other-observables" tabindex="-1"><a class="header-anchor" href="#other-observables"><span>Other Observables</span></a></h1>
<p><code v-pre>rxNostr.createAllErrorObservable()</code> によってエラーを監視することができます。これは典型的には</p>
<div class="custom-container tip"><p class="custom-container-title">RxJS Tips</p>
<p><code v-pre>rxNostr.use()</code> が返す Observable は error で終了しません。これは、どこかひとつのリレーに起因するエラーによって Observable 全体が停止しないようにするためです。</p>
</div>
</div></template>


