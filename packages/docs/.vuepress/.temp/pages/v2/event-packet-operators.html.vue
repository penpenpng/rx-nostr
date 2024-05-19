<template><div><h1 id="eventpacket-operators" tabindex="-1"><a class="header-anchor" href="#eventpacket-operators"><span>EventPacket Operators</span></a></h1>
<p><code v-pre>rxNostr.use()</code> が返す <code v-pre>Observable&lt;EventPacket&gt;</code> に対して適用可能な Operator のリファレンスです。</p>
<nav class="table-of-contents"><ul><li><router-link to="#uniq">uniq()</router-link></li><li><router-link to="#createuniq">createUniq()</router-link></li><li><router-link to="#tie">tie()</router-link></li><li><router-link to="#createtie">createTie()</router-link></li><li><router-link to="#latest">latest()</router-link></li><li><router-link to="#latesteach">latestEach()</router-link></li><li><router-link to="#verify">verify()</router-link></li><li><router-link to="#filterbykind">filterByKind()</router-link></li><li><router-link to="#filterby">filterBy()</router-link></li><li><router-link to="#timeline">timeline()</router-link></li><li><router-link to="#sortevents">sortEvents()</router-link></li><li><router-link to="#dropexpiredevents">dropExpiredEvents()</router-link></li></ul></nav>
<h2 id="uniq" tabindex="-1"><a class="header-anchor" href="#uniq"><span>uniq()</span></a></h2>
<p><code v-pre>event.id</code> に基づいてイベントの重複を排除します。異なるリレーからもたらされた <code v-pre>EventPacket</code> であっても <code v-pre>event.id</code> が等しければ同一のイベントとみなします。</p>
<p>省略可能な <code v-pre>ObservableInput&lt;unknown&gt;</code> によって、内部のイベント ID の Set をフラッシュすることができます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> Subject <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rxjs"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> <span class="token punctuation">{</span> uniq <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

<span class="token keyword">const</span> flushes$ <span class="token operator">=</span> <span class="token keyword">new</span> <span class="token class-name">Subject<span class="token operator">&lt;</span><span class="token keyword">void</span><span class="token operator">></span></span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">uniq</span><span class="token punctuation">(</span>flushes$<span class="token punctuation">)</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token comment">// ...</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// イベントID の Set をフラッシュする</span>
flushes$<span class="token punctuation">.</span><span class="token function">next</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="createuniq" tabindex="-1"><a class="header-anchor" href="#createuniq"><span>createUniq()</span></a></h2>
<p>与えられた <code v-pre>keyFn</code> に基づいてイベントの重複を排除する Operator と、それに紐づくイベント ID の Set を返します。</p>
<p>省略可能な第二引数で、新しい Packet を観測するごとに呼び出されるコールバック関数を登録できます。</p>
<p><code v-pre>uniq()</code> と異なり、フラッシュするには単に返り値の set を <code v-pre>clear()</code> します。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> createUniq<span class="token punctuation">,</span> <span class="token keyword">type</span> <span class="token class-name">EventPacket</span> <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// イベントID に基づいて重複を排除する</span>
<span class="token keyword">const</span> keyFn <span class="token operator">=</span> <span class="token punctuation">(</span>packet<span class="token operator">:</span> EventPacket<span class="token punctuation">)</span><span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">=></span> packet<span class="token punctuation">.</span>event<span class="token punctuation">.</span>id<span class="token punctuation">;</span>

<span class="token keyword">const</span> onCache <span class="token operator">=</span> <span class="token punctuation">(</span>packet<span class="token operator">:</span> EventPacket<span class="token punctuation">)</span><span class="token operator">:</span> <span class="token keyword">void</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">`</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>id<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> を初めて観測しました</span><span class="token template-punctuation string">`</span></span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">;</span>
<span class="token keyword">const</span> onHit <span class="token operator">=</span> <span class="token punctuation">(</span>packet<span class="token operator">:</span> EventPacket<span class="token punctuation">)</span><span class="token operator">:</span> <span class="token keyword">void</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">`</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>id<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> はすでに観測されています</span><span class="token template-punctuation string">`</span></span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> <span class="token punctuation">[</span>uniq<span class="token punctuation">,</span> eventIds<span class="token punctuation">]</span> <span class="token operator">=</span> <span class="token function">createUniq</span><span class="token punctuation">(</span>keyFn<span class="token punctuation">,</span> <span class="token punctuation">{</span> onCache<span class="token punctuation">,</span> onHit <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">uniq</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token comment">// ...</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// 観測済みのイベント ID をフラッシュする</span>
eventIds<span class="token punctuation">.</span><span class="token function">clear</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="tie" tabindex="-1"><a class="header-anchor" href="#tie"><span>tie()</span></a></h2>
<p>異なるリレーからもたらされた同一のイベントをまとめ上げ、イベントごとにそれがどのリレーの上で観測済みかを <code v-pre>seenOn</code> に記録します。また、そのイベントが初めて観測されたものならば <code v-pre>isNew</code> フラグをセットします。</p>
<p><code v-pre>uniq()</code> と同様に、省略可能な <code v-pre>ObservableInput&lt;unknown&gt;</code> によって、内部の Map をフラッシュすることができます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> tie <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">tie</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token keyword">if</span> <span class="token punctuation">(</span>packet<span class="token punctuation">.</span>isNew<span class="token punctuation">)</span> <span class="token punctuation">{</span>
      <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">`</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>event<span class="token punctuation">.</span>id<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> は新しいイベントです</span><span class="token template-punctuation string">`</span></span><span class="token punctuation">)</span><span class="token punctuation">;</span>
    <span class="token punctuation">}</span>

    <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span>
      <span class="token template-string"><span class="token template-punctuation string">`</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>event<span class="token punctuation">.</span>id<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> は </span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>packet<span class="token punctuation">.</span>seenOn<span class="token punctuation">.</span>length<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string"> 個のリレーで観測されました</span><span class="token template-punctuation string">`</span></span>
    <span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="createtie" tabindex="-1"><a class="header-anchor" href="#createtie"><span>createTie()</span></a></h2>
<p><code v-pre>tie()</code> とほぼ同様の Operator と、それに紐づく Map を返します。Map の型は <code v-pre>Map&lt;string, Set&lt;string&gt;&gt;</code> で、キーはイベント ID、値はリレーの集合です。</p>
<p><code v-pre>tie()</code> と異なり、フラッシュするには単に返り値の map を <code v-pre>clear()</code> します。</p>
<h2 id="latest" tabindex="-1"><a class="header-anchor" href="#latest"><span>latest()</span></a></h2>
<p>過去に観測した中で最も新しい <code v-pre>created_at</code> を持つイベントのみ通し、それ以外を排除します。言い換えると、Observable を流れるイベントの時系列順序を担保できます。</p>
<h2 id="latesteach" tabindex="-1"><a class="header-anchor" href="#latesteach"><span>latestEach()</span></a></h2>
<p>与えられた <code v-pre>keyFn</code> に基づいて、キーごとにもっとも新しい <code v-pre>created_at</code> を持つイベントのみ通し、それ以外を排除します。</p>
<p>ユーザごとの最新の kind0 を収集したいときなどに役立ちます。</p>
<h2 id="verify" tabindex="-1"><a class="header-anchor" href="#verify"><span>verify()</span></a></h2>
<p>イベントの署名を検証し、検証に失敗したイベントを排除します。</p>
<p>通常、検証処理は rx-nostr によって自動で行われますが、<code v-pre>skipVerify</code> が有効になっている場合にはこの Operator が便利です。</p>
<h2 id="filterbykind" tabindex="-1"><a class="header-anchor" href="#filterbykind"><span>filterByKind()</span></a></h2>
<p>与えられた kind のイベントのみ通し、それ以外を排除します。</p>
<h2 id="filterby" tabindex="-1"><a class="header-anchor" href="#filterby"><span>filterBy()</span></a></h2>
<p>与えられたフィルターに合致するイベントのみ通し、それ以外を排除します。</p>
<p>省略可能な第二引数に <code v-pre>not</code> を指定すると、フィルター条件を反転させることができます。</p>
<p>リレーに対してはすべての kind1 を要求しつつ、クライアントサイドでそれらを細かく振り分けたい場合などに便利です。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> share <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rxjs"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> <span class="token punctuation">{</span> filterBy <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

<span class="token keyword">const</span> kind1$ <span class="token operator">=</span> rxNostr<span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">share</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

kind1$<span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">filterBy</span><span class="token punctuation">(</span><span class="token punctuation">{</span> authors<span class="token operator">:</span> <span class="token constant">USER_LIST_1</span> <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token comment">// ...</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
kind1$<span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">filterBy</span><span class="token punctuation">(</span><span class="token punctuation">{</span> authors<span class="token operator">:</span> <span class="token constant">USER_LIST_2</span> <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
  <span class="token comment">// ...</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

rxReq<span class="token punctuation">.</span><span class="token function">emit</span><span class="token punctuation">(</span><span class="token punctuation">{</span> kinds<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token number">1</span><span class="token punctuation">]</span> <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><div class="custom-container warning"><p class="custom-container-title">WARNING</p>
<p><code v-pre>search</code> フィールドと <code v-pre>limit</code> フィールドは無視されることに注意してください。</p>
</div>
<h2 id="timeline" tabindex="-1"><a class="header-anchor" href="#timeline"><span>timeline()</span></a></h2>
<p><code v-pre>EventPacket</code> の Observable を <code v-pre>EventPacket[]</code> の Observable に変換します。変換後の各 <code v-pre>EventPacket[]</code> は、その時点での最新 <code v-pre>limit</code> 件のイベントです。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> timeline <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">timeline</span><span class="token punctuation">(</span><span class="token number">5</span><span class="token punctuation">)</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packets<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token builtin">console</span><span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">`</span><span class="token string">最新5件のイベントは</span><span class="token template-punctuation string">`</span></span><span class="token punctuation">,</span> packets<span class="token punctuation">)</span><span class="token punctuation">;</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="sortevents" tabindex="-1"><a class="header-anchor" href="#sortevents"><span>sortEvents()</span></a></h2>
<p>与えられた待機時間とソートキーに基づいて、可能な限り順序を保った Observable に変換します。</p>
<p>省略可能な第二引数でソートキーを設定できます。省略された場合は <code v-pre>created_at</code> に基づいて昇順にソートされます。すなわち、できる限り <code v-pre>created_at</code> の時間が前後しないような Observable が得られます。</p>
<div class="language-typescript" data-ext="ts" data-title="ts"><pre v-pre class="language-typescript"><code><span class="token keyword">import</span> <span class="token punctuation">{</span> sortEvents <span class="token punctuation">}</span> <span class="token keyword">from</span> <span class="token string">"rx-nostr"</span><span class="token punctuation">;</span>

<span class="token comment">// ...</span>

rxNostr
  <span class="token punctuation">.</span><span class="token function">use</span><span class="token punctuation">(</span>rxReq<span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">pipe</span><span class="token punctuation">(</span><span class="token function">sortEvents</span><span class="token punctuation">(</span><span class="token number">3</span> <span class="token operator">*</span> <span class="token number">1000</span><span class="token punctuation">)</span><span class="token punctuation">)</span>
  <span class="token punctuation">.</span><span class="token function">subscribe</span><span class="token punctuation">(</span><span class="token punctuation">(</span>packet<span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token punctuation">{</span>
    <span class="token comment">// 3 秒遅延する代わりに、可能な限り順序通りのイベントを得る</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre></div><h2 id="dropexpiredevents" tabindex="-1"><a class="header-anchor" href="#dropexpiredevents"><span>dropExpiredEvents()</span></a></h2>
<p><a href="https://github.com/nostr-protocol/nips/blob/master/40.md" target="_blank" rel="noopener noreferrer">NIP-40</a> に基づいてイベントが期限切れになっているかどうかを確認し、期限切れのイベントを排除します。</p>
<p>通常、この処理は rx-nostr によって自動で行われますが、<code v-pre>skipExpirationCheck</code> が有効になっている場合にはこの Operator が便利です。</p>
</div></template>


