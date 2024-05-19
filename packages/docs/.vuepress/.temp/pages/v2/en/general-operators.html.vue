<template><div><h1 id="general-operators" tabindex="-1"><a class="header-anchor" href="#general-operators"><span>General Operators</span></a></h1>
<p>汎用的な Operator のリファレンスです。</p>
<nav class="table-of-contents"><ul><li><router-link to="#completeontimeout">completeOnTimeout()</router-link></li><li><router-link to="#sort">sort()</router-link></li><li><router-link to="#filterbysubid">filterBySubId()</router-link></li></ul></nav>
<h2 id="completeontimeout" tabindex="-1"><a class="header-anchor" href="#completeontimeout"><span>completeOnTimeout()</span></a></h2>
<p>一定時間何も観測しない時間が続いたときに Observable を complete します。</p>
<div class="custom-container tip"><p class="custom-container-title">Note</p>
<p><a href="https://rxjs.dev/api/operators/timeout" target="_blank" rel="noopener noreferrer"><code v-pre>timeout()</code><ExternalLinkIcon/></a> は complete ではなく error で終了します。</p>
</div>
<h2 id="sort" tabindex="-1"><a class="header-anchor" href="#sort"><span>sort()</span></a></h2>
<p><RouteLink to="/v2/en/event-packet-operators.html#sortevents"><code v-pre>sortEvents()</code></RouteLink> の、より汎用的なバリエーションです。</p>
<h2 id="filterbysubid" tabindex="-1"><a class="header-anchor" href="#filterbysubid"><span>filterBySubId()</span></a></h2>
<p>与えられた値と合致する <code v-pre>subId</code> を持つ Packet のみ抽出し、それ以外を排除します。<code v-pre>EventPacket</code>, <code v-pre>EosePacket</code>, <code v-pre>ClosedPacket</code>, <code v-pre>CountPacket</code> の Observable で利用可能です。</p>
</div></template>


