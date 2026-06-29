/**
 * Application constants.
 */

export const APP_NAME = "{{ cookiecutter.project_name }}";
export const APP_DESCRIPTION = "{{ cookiecutter.project_description }}";

// API Routes (Next.js internal routes)
export const API_ROUTES = {
  // Auth
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  LOGOUT: "/auth/logout",
  REFRESH: "/auth/refresh",
  ME: "/auth/me",

  // Health
  HEALTH: "/health",

  // Users
  USERS: "/users",

  // Chat (AI Agent)
  CHAT: "/chat",
} as const;

// Navigation routes
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  CHAT: "/chat",
  PROFILE: "/settings/profile",
  SETTINGS: "/settings",
  RAG: "/rag",
  ADMIN: "/admin",
  ADMIN_USERS: "/admin/users",
  ADMIN_CONVERSATIONS: "/admin/conversations",
  ADMIN_RATINGS: "/admin/ratings",
  ORGS: "/orgs",
  ORG_MEMBERS: (id: string) => `/orgs/${id}/members`,
  ORG_SETTINGS: (id: string) => `/orgs/${id}/settings`,
  KB: "/kb",
  KB_DETAIL: (id: string) => `/kb/${id}`,
  BILLING: "/billing",
  PRICING: "/pricing",
} as const;

const DEFAULT_BACKEND_PORT = "{{ cookiecutter.backend_port }}";

function publicBackendUrl(kind: "http" | "ws") {
  const explicit =
    kind === "ws" ? process.env.NEXT_PUBLIC_WS_URL : process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    const isHttps = window.location.protocol === "https:";
    const protocol = kind === "ws" ? (isHttps ? "wss" : "ws") : isHttps ? "https" : "http";
    const port = process.env.NEXT_PUBLIC_BACKEND_PORT || DEFAULT_BACKEND_PORT;
    return `${protocol}://${window.location.hostname}:${port}`;
  }

  return `${kind}://localhost:${DEFAULT_BACKEND_PORT}`;
}

// WebSocket URL (for chat - direct to backend, use wss:// in production)
export const WS_URL = publicBackendUrl("ws");

// Backend API URL (public, for direct links like API docs)
export const BACKEND_URL = publicBackendUrl("http");
