/**
 * SECRET ADMIN ROUTE PATH.
 *
 * The admin folder at `src/app/control-7f3a9b2c/` is the ONLY entry point to
 * the admin surface. The path segment `control-7f3a9b2c` is intentionally
 * unguessable so the login page is not discoverable by URL scanning.
 *
 * To rotate the secret: (1) edit the segment below, (2) rename the folder
 * `src/app/control-7f3a9b2c/` to match, (3) redeploy. Internal links use
 * these constants so they update automatically.
 *
 * This is obscurity-layer defense; the real access boundary remains the
 * Supabase AAL2 auth + RLS enforced by `requireAdmin({ aal2 })`.
 */
export const ADMIN_BASE_PATH = "/control-7f3a9b2c";
export const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;
export const ADMIN_MFA_ENROLL_PATH = `${ADMIN_BASE_PATH}/mfa/enroll`;
export const ADMIN_MFA_CHALLENGE_PATH = `${ADMIN_BASE_PATH}/mfa/challenge`;
export const ADMIN_PASSWORD_RECOVERY_PATH = `${ADMIN_BASE_PATH}/password-recovery`;
export const ADMIN_DASHBOARD_PATH = ADMIN_BASE_PATH;
export const ADMIN_PRODUCTS_PATH = `${ADMIN_BASE_PATH}/products`;
export const ADMIN_NEW_PRODUCT_PATH = `${ADMIN_PRODUCTS_PATH}/new`;
export const ADMIN_AUDIT_PATH = `${ADMIN_BASE_PATH}/audit`;
export const ADMIN_SECURITY_PATH = `${ADMIN_BASE_PATH}/security`;
export const ADMIN_TAXONOMIES_PATH = `${ADMIN_BASE_PATH}/taxonomies`;
export const ADMIN_ORDERS_PATH = `${ADMIN_BASE_PATH}/orders`;
