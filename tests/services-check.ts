/** Optional isolated-container acceptance check. Never point this at a real database. */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { seed } from "../lib/model";
const env = Object.fromEntries(
  (await readFile("/tmp/friendcircle-services.env", "utf8"))
    .trim()
    .split("\n")
    .map((line) => line.split("=")),
);
process.env.APP_MODE = "live";
process.env.DATABASE_URL = `postgresql://friendcircle:${env.POSTGRES_PASSWORD}@127.0.0.1:15437/friendcircle`;
const { initStore, transact, nearbyUserIds, closeStore } =
  await import("../server/store");
await initStore();
try {
  await transact((s) => Object.assign(s, seed()));
  const me = await transact((s) => s.people[0]);
  const nearby = await nearbyUserIds(me, 0.8);
  assert.ok(nearby?.has("mia"));
  assert.ok(!nearby?.has("james"));
  await assert.rejects(
    transact((s) => {
      s.people[0].name = "Should roll back";
      throw Error("rollback test");
    }),
  );
  assert.equal(await transact((s) => s.people[0].name), "Alex Morgan");
  console.log(
    "PASS PostgreSQL transaction persistence, rollback, and PostGIS radius query",
  );
} finally {
  await closeStore();
}
function crc32(buffer: Buffer) {
  let c = 0xffffffff;
  for (const b of buffer) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type),
    len = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(128, 0);
header.writeUInt32BE(128, 4);
header[8] = 8;
header[9] = 2;
const rows = Buffer.alloc(128 * (128 * 3 + 1), 255);
for (let i = 0; i < 128; i++) rows[i * (128 * 3 + 1)] = 0;
const blank = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(rows)),
  chunk("IEND", Buffer.alloc(0)),
]);
const form = () => {
  const f = new FormData();
  f.set("photo", new Blob([blank], { type: "image/png" }), "blank.png");
  return f;
};
const unauthorized = await fetch("http://127.0.0.1:18017/verify", {
  method: "POST",
  body: form(),
});
assert.equal(unauthorized.status, 401);
const response = await fetch("http://127.0.0.1:18017/verify", {
  method: "POST",
  headers: { Authorization: `Bearer ${env.FACE_VERIFIER_TOKEN}` },
  body: form(),
});
assert.equal(response.status, 200, await response.clone().text());
const result = await response.json();
assert.deepEqual(result, { faceCount: 0, confidence: 0 });
console.log(
  "PASS TensorFlow Lite model startup, private service authentication, and zero-face rejection",
);
