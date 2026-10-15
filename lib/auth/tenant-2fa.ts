// path: lib/auth/tenant-2fa.ts
import "server-only";

import { getConfigurationValue } from "@/lib/db/repositories/config";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";

/** Tenant configuration key that enforces 2FA for staff members. */
export const TENANT_ENFORCE_2FA_KEY = "auth.tenant_enforce_2fa";

/**
 * The tenant's staff 2FA enforcement flag. Falls back to false when unset so
 * staff 2FA is opt-in until the owner enables it; non-staff roles are always
 * aal2 regardless of this value.
 */
export async function readTenantEnforce2FA(
  userId: string,
  correlationId: string,
): Promise<boolean> {
  const context = makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId,
    role: "staff",
    correlationId,
  });
  try {
    const value = await getConfigurationValue(context, TENANT_ENFORCE_2FA_KEY);
    return value === true;
  } catch {
    return false;
  }
}
