/** An uncompressed P-256 public key is 65 bytes, encoded as 87 base64url chars. */
export function validPushPublicKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(value)) return false
  try {
    const bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=')
    return bytes.length === 65 && bytes.charCodeAt(0) === 4
  } catch { return false }
}
