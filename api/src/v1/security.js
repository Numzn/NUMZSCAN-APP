import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export const hmacHex = (key, value) => crypto.createHmac("sha256", key).update(value).digest("hex");

export const sha256Hex = (value) => crypto.createHash("sha256").update(value).digest("hex");

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN, { ...SCRYPT_PARAMS, maxmem: SCRYPT_MAXMEM });
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_MAXMEM,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

let dummyHash;
// Spends the same hashing time for unknown users, so login timing does not reveal which emails exist.
export async function burnPasswordTime(password) {
  dummyHash ??= await hashPassword(randomToken());
  await verifyPassword(password, dummyHash);
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = "Not found") => new ApiError(404, "NOT_FOUND", message);
export const forbidden = (message = "Forbidden") => new ApiError(403, "FORBIDDEN", message);
export const conflict = (code, message) => new ApiError(409, code, message);
export const unauthenticated = (message = "Authentication required") =>
  new ApiError(401, "UNAUTHENTICATED", message);
