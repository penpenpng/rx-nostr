<template><div><h1 id="error-handling" tabindex="-1"><a class="header-anchor" href="#error-handling"><span>Error Handling</span></a></h1>
<p><code v-pre>rxNostr.use()</code> の戻り値を始めとして <code v-pre>RxNostr</code> が発行する Observable は原則として error で終了しません。これはどこか 1 つのリレーに起因するエラーによって Observable 全体が停止しないようにするためです。代わりに <code v-pre>rxNostr.createAllErrorObservable()</code> を通じてエラーを監視することができます。</p>
</div></template>


