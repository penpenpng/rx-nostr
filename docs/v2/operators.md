# Operators

rx-nostr の各所に存在する `subscribe()` 可能なオブジェクトは実際には RxJS の Observable インスタンスです。これらと、例外として `RxReq` インスタンスはすべて `pipe()` メソッドを備えているため RxJS の [operator](https://rxjs.dev/guide/operators) が適用可能で、これにより高度なユースケースがサポートされます。

::: tip RxJS Tips
operator とは Observable から Observable への関数です。これを `pipe()` に渡すことで、`subscribe()` される前に各種の Packet を宣言的に加工することができます。詳しくは RxJS のドキュメントを参照してください。
:::

RxJS 標準の operator はもちろんのこと、rx-nostr が独自に提供するものや、ユーザ定義のものも同様に利用できます。具体的な例は [Examples](./examples.md) を参照してください。
