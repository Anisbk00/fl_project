/**
 * Server-only auth helpers. Importing from a Client Component fails the build
 * because this barrel re-exports modules that import `server-only`.
 */
export {
  isAdminSession,
  requireAdmin,
  UnauthorizedError,
  type AdminClient,
} from "./is-admin";
