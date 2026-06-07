/** Default org id placeholder for future multi-tenant scaffolding. */
export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001'

export function defaultOrganizationId(): string {
  return process.env.DEFAULT_ORGANIZATION_ID ?? DEFAULT_ORGANIZATION_ID
}
