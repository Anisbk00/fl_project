/**
 * AAL2 claim parsing (Step 4).
 *
 * Supabase sets `aal` to 'aal2' on the JWT after a verified MFA challenge.
 * The server guard uses the SDK's verified-claims operation (e.g.
 * `auth.getClaims()`), NEVER `getSession()` or an unverified cookie payload.
 * This pure helper reasons over the verified claims object the SDK returns.
 */
export interface VerifiedClaims {
  sub: string;
  aal?: string; // 'aal1' | 'aal2'
  // other claims omitted — only what authorization needs.
}

export function isAal2(claims: VerifiedClaims | null | undefined): boolean {
  return !!claims && claims.aal === "aal2";
}

export function isAal1(claims: VerifiedClaims | null | undefined): boolean {
  return !!claims && claims.aal === "aal1";
}

/** A minimal admin principal returned by the central guard. */
export interface AdminPrincipal {
  uid: string;
  aal2: boolean;
}

export function toAdminPrincipal(claims: VerifiedClaims | null | undefined): AdminPrincipal | null {
  if (!claims?.sub) return null;
  return { uid: claims.sub, aal2: isAal2(claims) };
}
