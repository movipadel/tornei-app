import { createHash, randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MOVIBACK_CODE_BATCH_MAX = 500;

export function normalizeMovibackAgreementCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashMovibackAgreementCode(value: string) {
  const normalized = normalizeMovibackAgreementCode(value);
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

export function generateMovibackAgreementCode() {
  let body = "";
  for (let index = 0; index < 20; index += 1) body += ALPHABET[randomInt(ALPHABET.length)];
  return `MOVI-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15, 20)}`;
}

export function generateMovibackAgreementCodeBatch(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MOVIBACK_CODE_BATCH_MAX) {
    throw new Error("Quantità codici non valida");
  }
  const plaintext = new Set<string>();
  while (plaintext.size < quantity) plaintext.add(generateMovibackAgreementCode());
  return [...plaintext].map((code) => ({
    code,
    hash: hashMovibackAgreementCode(code),
    suffix: normalizeMovibackAgreementCode(code).slice(-6),
  }));
}
