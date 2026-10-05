// Credential payload shape: "EP1:" and 43 base64url characters, nothing else.
export const CREDENTIAL_PATTERN = /^EP1:[A-Za-z0-9_-]{43}$/;

export function isCredentialToken(value: string): boolean {
  return CREDENTIAL_PATTERN.test(value);
}
