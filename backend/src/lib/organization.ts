/** Seeded default org id — matches migration 0008_org_scaffold.sql */
export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001'

export function defaultOrganizationId(): string {
  return process.env.DEFAULT_ORGANIZATION_ID ?? DEFAULT_ORGANIZATION_ID
}
