import { eq } from "drizzle-orm";
import {
  APP_ROLES,
  getHighestRole,
  isHumanRole,
  type AppRole,
  type HumanRole,
  type Permission,
} from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";
import { isActivePlatformAdmin } from "../d1/platformAdmins";
import { getSupportMemberships, isActiveSupportAccount } from "../d1/supportAccess";
import { hotelUsers } from "../../drizzle/d1-schema";
import type { D1CallerContext, D1ScopedDatabase } from "../db/scope";
import { createAuth, type AuthInstance } from "../auth";
import type { PublicBookingLimiter } from "../publicBookingRateLimit";
import { getMfaStepUpVerifiedAt } from "../mfaStepUp";

export type SupabaseMembership = {
  hotelId: string;
  role: HumanRole;
  permissions: Permission[];
  expiresAt?: Date;
  mode?: "view" | "edit";
};

export type AppUserIdentity = {
  id: string;
  email: string | null;
  name: string | null;
  role?: AppRole | null;
  roles?: AppRole[];
  memberships?: SupabaseMembership[];
  accessToken: string;
  appMetadata: { role?: string; [key: string]: unknown };
  userMetadata: Record<string, unknown>;
  twoFactorEnabled?: boolean;
  session?: unknown;
};

export type SupabaseIdentity = AppUserIdentity;

export type TrpcContext = {
  user: AppUserIdentity | null;
  clientIp: string;
  caller?: D1CallerContext;
  req?: any;
  res?: any;
  db?: D1ScopedDatabase;
  session?: unknown;
  /** PUBLIC_BOOKING_LIMITER binding; set by the Worker only. */
  publicBookingLimiter?: PublicBookingLimiter;
  /** CF-Connecting-IP header, the PUBLIC_BOOKING_LIMITER key; set by the Worker only. */
  cfConnectingIp?: string;
  /** Better Auth instance that resolved the session, for server-side auth calls. */
  auth?: AuthInstance;
  /** Request headers that carried the session. */
  headers?: Headers;
};

export type CreateContextOptions = {
  req?: Request;
  headers?: Headers | Record<string, string | string[] | undefined>;
  authorization?: string | null;
  clientIp?: string | null;
  db?: D1ScopedDatabase;
  auth?: AuthInstance;
};

function normalizeHeaders(
  input?: Request | Headers | Record<string, string | string[] | undefined> | string | null,
): Headers {
  if (!input) return new Headers();
  if (input instanceof Headers) return input;
  if (typeof Request !== "undefined" && input instanceof Request) return input.headers;
  if (typeof input === "string") {
    const h = new Headers();
    if (input.trim()) h.set("authorization", input.trim());
    return h;
  }
  const h = new Headers();
  for (const [key, val] of Object.entries(input)) {
    if (Array.isArray(val)) {
      for (const item of val) h.append(key, item);
    } else if (typeof val === "string") {
      h.set(key, val);
    }
  }
  return h;
}

export async function createContextFromRequest(
  requestOrAuth?: Request | string | CreateContextOptions | null,
  clientIpArg?: string | null,
  dbArg?: D1ScopedDatabase | null,
): Promise<TrpcContext> {
  let req: Request | undefined;
  let headers: Headers;
  let clientIp = clientIpArg ?? "unknown";
  let db = dbArg ?? undefined;
  let authOverride: AuthInstance | undefined;
  const isObjectCall = !!(
    requestOrAuth &&
    typeof requestOrAuth === "object" &&
    !(requestOrAuth instanceof Request)
  );

  if (isObjectCall) {
    const opts = requestOrAuth as CreateContextOptions;
    req = opts.req;
    headers = opts.req ? opts.req.headers : normalizeHeaders(opts.headers ?? opts.authorization);
    clientIp = opts.clientIp ?? clientIp;
    db = opts.db ?? db;
    authOverride = opts.auth;
  } else if (typeof Request !== "undefined" && requestOrAuth instanceof Request) {
    req = requestOrAuth;
    headers = requestOrAuth.headers;
  } else {
    headers = normalizeHeaders(requestOrAuth);
  }

  const hasAuth = !!(headers.get("cookie") || headers.get("authorization"));

  // If no credentials, short circuit
  if (!hasAuth) {
    if (!db && !isObjectCall) {
      return {
        user: null,
        clientIp: clientIp || "unknown",
      };
    }
    return {
      user: null,
      caller: { userId: "", roles: [], access: "public" },
      clientIp: clientIp || "unknown",
      req,
      db,
      session: null,
    };
  }

  // If DB is available, resolve via Better Auth
  if (db) {
    try {
      const origin =
        (req?.url && req.url.startsWith("http") ? new URL(req.url).origin : undefined) ||
        (headers.get("origin") ?? undefined) ||
        (headers.get("x-forwarded-proto") && headers.get("host")
          ? `${headers.get("x-forwarded-proto")}://${headers.get("host")}`
          : undefined);
      const auth = authOverride ?? createAuth({ db, baseURL: origin });
      const sessionResult = await auth.api.getSession({ headers });

      if (sessionResult && sessionResult.user && sessionResult.session) {
        const { user: authUser, session: authSession } = sessionResult;

        const membershipRows = await db
          .select()
          .from(hotelUsers)
          .where(eq(hotelUsers.userId, authUser.id));

        const memberships: SupabaseMembership[] = membershipRows
          .filter(row => isHumanRole(row.role))
          .map(row => ({
            hotelId: row.hotelId,
            role: row.role as HumanRole,
            permissions: resolveMembershipPermissions(row.role as AppRole, {
              grants: row.permissionGrants ?? [],
              revokes: row.permissionRevokes ?? [],
            }),
          }));

        const roles: AppRole[] = APP_ROLES.filter(role =>
          membershipRows.some(row => row.role === role),
        );
        if (
          membershipRows.some(row => row.role === "super_admin") &&
          !roles.includes("super_admin")
        ) {
          roles.push("super_admin");
        }
        if (!roles.includes("super_admin") && await isActivePlatformAdmin(db, authUser.id)) {
          roles.push("super_admin");
        }
        if (!roles.includes("support") && await isActiveSupportAccount(db, authUser.id)) {
          roles.push("support");
        }

        const resolvedRole = getHighestRole(roles);

        const caller: D1CallerContext = {
          userId: authUser.id,
          roles,
          access: "authenticated",
        };

        const supportMemberships = await getSupportMemberships(db, caller);
        const scopedMemberships = roles.includes("support") ? supportMemberships : memberships;

        const twoFactorEnabled = (authUser as { twoFactorEnabled?: boolean }).twoFactorEnabled ?? false;
        // Better Auth sessions carry no proof of a recent TOTP check; see server/mfaStepUp.ts.
        const twoFactorVerifiedAt = twoFactorEnabled ? await getMfaStepUpVerifiedAt(db, authSession.id, authUser.id) : null;
        const session = { ...authSession, twoFactorVerifiedAt };

        const user: AppUserIdentity = {
          id: authUser.id,
          email: authUser.email ?? null,
          name: authUser.name ?? authUser.email ?? null,
          role: resolvedRole,
          roles,
          memberships: scopedMemberships,
          accessToken: authSession.token,
          appMetadata: {
            role: resolvedRole ?? undefined,
          },
          userMetadata: {
            name: authUser.name,
            email: authUser.email,
          },
          twoFactorEnabled,
          session,
        };

        return {
          user,
          caller,
          clientIp: clientIp || "unknown",
          req,
          db,
          session,
          auth,
          headers,
        };
      }
    } catch (error) {
      console.error("[Auth] Unexpected error during session resolution in createContext:", error);
    }

    return {
      user: null,
      caller: { userId: "", roles: [], access: "public" },
      clientIp: clientIp || "unknown",
      req,
      db,
      session: null,
    };
  }

  // Fallback to legacy Supabase identity when db is not provided
  return {
    user: null,
    clientIp: clientIp || "unknown",
  };
}
