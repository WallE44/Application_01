// Hachage des mots de passe (ENF-01) : PBKDF2-SHA-256 avec sel aléatoire de 16 octets.

export const DEFAULT_ITERATIONS = 310000;

const subtle = () => globalThis.crypto.subtle;
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return toHex(a);
}

async function derive(password, saltHex, iterations) {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    key,
    256,
  );
  return toHex(bits);
}

/** Retourne { algo, iterations, salt, hash } — jamais le mot de passe. */
export async function hashPassword(password, { iterations = DEFAULT_ITERATIONS, salt = randomHex(16) } = {}) {
  return { algo: 'PBKDF2-SHA256', iterations, salt, hash: await derive(password, salt, iterations) };
}

/** Comparaison en temps constant du hash calculé. */
export async function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const h = await derive(password, record.salt, record.iterations);
  if (h.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}
