import type { Message } from "./model";
const encode = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Private keys remain on this device in IndexedDB; only public keys leave it.
async function db() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("friendcircle-keys", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function keys(uid: string): Promise<CryptoKeyPair> {
  const d = await db();
  const existing = await new Promise<CryptoKeyPair | undefined>(
    (resolve, reject) => {
      const r = d.transaction("keys").objectStore("keys").get(uid);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    },
  );
  if (existing) {
    d.close();
    return existing;
  }
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"],
  );
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction("keys", "readwrite");
    tx.objectStore("keys").put(pair, uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  d.close();
  return pair;
}
async function shared(privateKey: CryptoKey, publicKey: JsonWebKey) {
  return crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: await crypto.subtle.importKey(
        "jwk",
        publicKey,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        [],
      ),
    },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encrypt(
  text: string,
  pair: CryptoKeyPair,
  recipientKey: JsonWebKey,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await shared(pair.privateKey, recipientKey);
  return {
    kind: "encrypted",
    ciphertext: encode(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(text),
      ),
    ),
    iv: encode(iv.buffer),
    senderKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
    recipientKey,
  };
}
export async function decrypt(
  message: Message,
  uid: string,
  pair: CryptoKeyPair,
) {
  if (message.kind === "hi") return "👋 Hey! Fancy catching up?";
  try {
    const other =
      message.from === uid ? message.recipientKey : message.senderKey;
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(message.iv!) },
        await shared(pair.privateKey, other!),
        decode(message.ciphertext!),
      ),
    );
  } catch {
    return "This message cannot be opened on this device.";
  }
}
