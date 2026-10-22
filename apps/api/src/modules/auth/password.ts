import { hash, verify } from "@node-rs/argon2";

// NAPI's ambient const enum cannot be imported with verbatimModuleSyntax; 2 is Argon2id.
const parameters = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 };
export function hashPassword(password: string) { return hash(password, parameters); }
export function verifyPassword(encoded: string, password: string) { return verify(encoded, password); }
