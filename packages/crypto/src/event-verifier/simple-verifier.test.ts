import { expect, test } from "vitest";
import { SimpleVerifier } from "./simple-verifier.ts";

test(SimpleVerifier.name, async () => {
  const verifier = new SimpleVerifier();

  await expect(
    verifier.verifyEvent({
      content: "hello world",
      created_at: 1744992061,
      id: "67566ef8eceb6dffae47606fd737425d7bcddaa9338bddc144588e4a0051913e",
      kind: 1,
      pubkey: "ac129311ffd0b65155c217d12e68dec3fac1652b310219cd11d4057714d4b98d",
      sig: "19c12bde8a88537261395180601205fb771337ed456a1cb88d851f9c293774cf7140143cfaba72552c6375da3ac3d6a96690eb90647c9e5b1d9c1594b813b22e",
      tags: [],
    }),
  ).resolves.toBe(true);

  await expect(
    verifier.verifyEvent({
      content: "hello world",
      created_at: 1744992061,
      id: "67566ef8eceb6dffae47606fd737425d7bcddaa9338bddc144588e4a0051913e",
      kind: 1,
      pubkey: "ac129311ffd0b65155c217d12e68dec3fac1652b310219cd11d4057714d4b98d",
      // sig: "19c12bde8a88537261395180601205fb771337ed456a1cb88d851f9c293774cf7140143cfaba72552c6375da3ac3d6a96690eb90647c9e5b1d9c1594b813b22e",
      tags: [],
    } as any),
  ).resolves.toBe(false);

  await expect(
    verifier.verifyEvent({
      content: "hello world",
      created_at: 1744992061,
      id: "67566ef8eceb6dffae47606fd737425d7bcddaa9338bddc144588e4a0051913e",
      kind: 1,
      pubkey: "ac129311ffd0b65155c217d12e68dec3fac1652b310219cd11d4057714d4b98d",
      sig: "19c12bde8a88537261395180601205fb771337ed456a1cb88d851f9c293774cf7140143cfaba72552c6375da3ac3d6a96690eb90647c9e5b1d9c1594b813b22e",
      // tags: [],
    } as any),
  ).resolves.toBe(false);
});
