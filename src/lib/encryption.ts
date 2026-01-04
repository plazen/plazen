/**
 * encryption.ts
 *
 * Utility helpers for simple symmetric encryption/decryption used across the
 * application. This module uses AES-256-GCM to provide authenticated encryption:
 * the output format is: iv:authTag:ciphertext (all hex-encoded).
 *
 * Notes and security considerations:
 * - The code expects an environment variable `ENCRYPTION_KEY` containing a
 *   64-character hex string (i.e. 32 bytes). This is required to derive the
 *   AES-256 key. If the key is missing or malformed we currently fall back to
 *   a zeroed buffer to avoid crashing in development environments; in
 *   production you should ensure the environment is configured and preferably
 *   fail fast instead of silently using a dummy key.
 * - AES-GCM requires a unique IV per encryption. We generate a random IV for
 *   each call to `encrypt`. Re-using IVs with the same key is catastrophic for
 *   security — be sure the key remains secret and never reuse IVs.
 * - The format `iv:authTag:ciphertext` is simple and easy to parse. All parts
 *   are hex-encoded strings.
 *
 * Exported functions:
 * - encrypt(text): returns the encoded ciphertext (iv:tag:content)
 * - decrypt(hash): returns the plaintext or the original input on failure
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

// Validate and initialise the symmetric key used for AES-256-GCM.
// Expect ENCRYPTION_KEY to be a 64-character hex string (32 bytes).
let KEY: Buffer;
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  // Log a clear message so missing configuration is visible in logs.
  // In development we fallback to a zeroed key to avoid hard crashes, but in
  // production you should ensure the env var is present and consider throwing.
  console.error(
    "ENCRYPTION_KEY is not set or is not a 64-character hex string.",
  );
  // Use a dummy key in case of error, but log it. This prevents crashes.
  // In a real production environment, you might want to throw an error instead.
  KEY = Buffer.alloc(32); // Creates a 32-byte buffer of zeros
} else {
  KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Purpose:
 * - Provide authenticated symmetric encryption for small text values stored
 *   by the application (e.g. tokens, secrets). The function returns a compact
 *   colon-delimited hex string containing IV, auth tag and ciphertext.
 *
 * Behaviour:
 * - Generates a cryptographically secure random IV for each operation.
 * - Uses AES-256-GCM for authenticated encryption (AEAD) to detect tampering.
 * - Produces output in the form: ivHex:authTagHex:cipherHex
 *
 * Notes:
 * - The caller should treat the returned value as an opaque string. This
 *   function does not attempt to persist or rotate keys — key management is an
 *   operational concern outside this helper.
 * - On error this implementation intentionally returns the original plaintext
 *   (to preserve backward compatibility and avoid throwing in higher-level
 *   code). Callers that require strict failure semantics should validate the
 *   output or adapt this behaviour.
 *
 * Example:
 * const secret = encrypt('my-secret-value');
 * // secret => 'a1b2...:deadbeef...:cafef00d...'
 *
 * @param text - Plaintext to encrypt. If empty, the input is returned unchanged.
 * @returns A string containing the hex-encoded iv, auth tag and ciphertext,
 *          joined by colons. If encryption fails the original input is returned.
 */
export function encrypt(text: string): string {
  if (!text) return text;
  if (!KEY) {
    console.error("Encryption key is not available.");
    return text;
  }

  try {
    // Generate a fresh IV for this encryption operation
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    // Update + final produce hex-encoded ciphertext
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // GCM provides an authentication tag which must be stored alongside the ciphertext
    const authTag = cipher.getAuthTag().toString("hex");

    // Store iv, authTag, and ciphertext together as hex strings separated by colon
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (error) {
    // On failure log the error and fall back to returning plaintext to avoid
    // crashing higher-level code that may not be prepared for exceptions.
    console.error("Encryption failed:", error);
    return text; // Fallback to plaintext if encryption fails
  }
}

/**
 * Decrypt a string previously encrypted with `encrypt`.
 *
 * Purpose:
 * - Reverse the output produced by `encrypt`, validating the authentication
 *   tag (GCM) and returning the original plaintext when successful.
 *
 * Behaviour & error handling:
 * - Expects input in the format ivHex:authTagHex:cipherHex.
 * - If the input does not match this format, if authentication fails (tampering,
 *   wrong key), or if any error occurs during decryption, the function returns
 *   the original input unchanged. This conservative behaviour preserves legacy
 *   compatibility and avoids throwing from callers that may pass plaintext
 *   values into this helper.
 *
 * Security note:
 * - Successful decryption implies the ciphertext was produced with the same
 *   key and was not tampered with. If decryption fails, treat the data as
 *   untrusted and handle accordingly.
 *
 * Example:
 * const plain = decrypt('a1b2...:deadbeef...:cafef00d...');
 *
 * @param hash - The colon-separated hex string produced by `encrypt`.
 * @returns The decrypted UTF-8 plaintext, or the original input if decryption fails.
 */
export function decrypt(hash: string): string {
  if (!hash) return hash;
  if (!KEY) {
    console.error("Decryption key is not available.");
    return "[Key Error]";
  }

  try {
    const parts = hash.split(":");

    // If it's not in our expected format, treat it as legacy/plaintext and return it unchanged.
    if (parts.length !== 3) {
      return hash;
    }

    const [ivHex, authTagHex, encryptedText] = parts;

    // Convert hex parts back to buffers
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    // Create decipher and set the authentication tag before finalising
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    // Decryption can fail for many reasons: wrong key, corrupted data,
    // or input that just isn't encrypted. Log a warning and return original.
    console.warn("Decryption failed, returning original text. Error:", error);
    return hash; // Return the original text if decryption fails
  }
}
