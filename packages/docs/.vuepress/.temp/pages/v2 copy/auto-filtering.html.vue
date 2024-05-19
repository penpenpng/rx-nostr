<template><div><h1 id="auto-filtering" tabindex="-1"><a class="header-anchor" href="#auto-filtering"><span>Auto Filtering</span></a></h1>
<p>rx-nostr は REQ の結果として返されるイベントのうち不適格と判断されるものを自動的にフィルターします。この挙動は <code v-pre>createRxNostr()</code> のオプションから変更できます。</p>
<h2 id="auto-verification" tabindex="-1"><a class="header-anchor" href="#auto-verification"><span>Auto Verification</span></a></h2>
<p>自動で署名を検証し、検証に失敗したイベントを結果から除きます。この挙動は <code v-pre>skipVerify</code> オプションで無効にできます。</p>
<h2 id="auto-validation" tabindex="-1"><a class="header-anchor" href="#auto-validation"><span>Auto Validation</span></a></h2>
<p>REQ の結果として返されたイベントが本当に REQ の filter に合致しているかを自動で検証し、検証に失敗したイベントを結果から除きます。この挙動は <code v-pre>skipValidateFilterMatching</code> オプションで無効にできます。</p>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p><code v-pre>search</code> フィールドに対する標準化された解釈は存在しないため、同フィールドの検証は行われません。</p>
</div>
<h2 id="auto-expiration-check" tabindex="-1"><a class="header-anchor" href="#auto-expiration-check"><span>Auto Expiration Check</span></a></h2>
<p><a href="https://github.com/nostr-protocol/nips/blob/master/40.md" target="_blank" rel="noopener noreferrer">NIP-40<ExternalLinkIcon/></a> に基づいて、REQ の結果として返されたイベントが期限切れとなっていないかを自動で確認し、期限が切れているイベントを結果から除きます。この挙動は <code v-pre>skipExpirationCheck</code> オプションで無効にできます。</p>
</div></template>


