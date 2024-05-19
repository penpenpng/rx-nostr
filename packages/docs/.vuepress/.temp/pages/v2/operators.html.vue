<template><div><h1 id="operators" tabindex="-1"><a class="header-anchor" href="#operators"><span>Operators</span></a></h1>
<p>rx-nostr の各所に存在する <code v-pre>subscribe()</code> 可能なオブジェクトは実際には RxJS の Observable インスタンスです。これらと、例外として <code v-pre>RxReq</code> インスタンスはすべて <code v-pre>pipe()</code> メソッドを備えているため RxJS の <a href="https://rxjs.dev/guide/operators" target="_blank" rel="noopener noreferrer">operator</a> が適用可能で、これにより高度なユースケースがサポートされます。</p>
<div class="custom-container tip"><p class="custom-container-title">RxJS Tips</p>
<p>operator とは Observable から Observable への関数です。これを <code v-pre>pipe()</code> に渡すことで、<code v-pre>subscribe()</code> される前に各種の Packet を宣言的に加工することができます。詳しくは RxJS のドキュメントを参照してください。</p>
</div>
<p>RxJS 標準の operator はもちろんのこと、rx-nostr が独自に提供するものや、ユーザ定義のものも同様に利用できます。</p>
</div></template>


