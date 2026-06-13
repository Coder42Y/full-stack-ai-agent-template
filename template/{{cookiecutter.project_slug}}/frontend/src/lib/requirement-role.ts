export type RequirementRole = "product" | "developer";

export const REQUIREMENT_ROLE_HEADER = "X-Requirement-Role";

export function normalizeRequirementRole(value: string | null | undefined): RequirementRole {
  return value === "developer" ? "developer" : "product";
}

export function requirementRoleHeaders(value: string | null | undefined): Record<string, string> {
  return {
    [REQUIREMENT_ROLE_HEADER]: normalizeRequirementRole(value),
  };
}
