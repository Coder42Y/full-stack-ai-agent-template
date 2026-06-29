export type RequirementRole = "product" | "developer" | "tester";

export const REQUIREMENT_ROLE_HEADER = "X-Requirement-Role";

export function normalizeRequirementRole(value: string | null | undefined): RequirementRole {
  return value === "developer" || value === "tester" ? value : "product";
}

export function requirementRoleHeaders(value: string | null | undefined): Record<string, string> {
  return {
    [REQUIREMENT_ROLE_HEADER]: normalizeRequirementRole(value),
  };
}
