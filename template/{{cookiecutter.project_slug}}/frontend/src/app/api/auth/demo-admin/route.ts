import { NextResponse, type NextRequest } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import { setAuthCookies } from "@/lib/auth-cookies";
import type { LoginResponse, User } from "@/types";

const DEMO_EMAIL = "admin-demo@example.com";
const DEMO_PASSWORD = "DemoAdmin123!";

async function loginDemoAdmin() {
  const formData = new URLSearchParams();
  formData.append("username", DEMO_EMAIL);
  formData.append("password", DEMO_PASSWORD);

  return backendFetch<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });
}

function withAuthCookies(request: NextRequest, user: User, token: LoginResponse) {
  const response = NextResponse.json({
    ...user,
    access_token: token.access_token,
    demo_admin: true,
  });

  setAuthCookies(response, request, token);

  return response;
}

export async function POST(request: NextRequest) {
  try {
    try {
      await backendFetch("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          full_name: "MVP Admin",
          role: "admin",
        }),
      });
    } catch (error) {
      if (!(error instanceof BackendApiError) || error.status !== 409) {
        throw error;
      }
    }

    const token = await loginDemoAdmin();
    const user = await backendFetch<User>("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    return withAuthCookies(request, user, token);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to create demo admin session" }, { status: 500 });
  }
}
