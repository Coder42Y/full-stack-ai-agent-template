export type LoginRole = "admin" | "developer" | "tester" | "product";

export const LOGIN_ROLES: Array<{
  value: LoginRole;
  label: string;
  description: string;
}> = [
  {
    value: "admin",
    label: "Admin",
    description: "系统管理、用户管理和全局查看",
  },
  {
    value: "developer",
    label: "Developer",
    description: "查询需求、拆解实现和提交变更建议",
  },
  {
    value: "tester",
    label: "Test",
    description: "查看需求、提炼验收标准和测试关注点",
  },
  {
    value: "product",
    label: "PM",
    description: "创建需求、维护 PRD 和审批变更草稿",
  },
];

export function isLoginRole(value: unknown): value is LoginRole {
  return (
    value === "admin" ||
    value === "developer" ||
    value === "tester" ||
    value === "product"
  );
}

export function roleLabel(value: string | null | undefined): string {
  return LOGIN_ROLES.find((role) => role.value === value)?.label ?? "Member";
}
