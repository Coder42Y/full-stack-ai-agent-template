import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import { clearAuthCookies, setAuthCookies } from "@/lib/auth-cookies";
import type { RefreshTokenResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get("refresh_token")?.value;

    if (!refreshToken) {
      return NextResponse.json({ detail: "No refresh token" }, { status: 401 });
    }

    const data = await backendFetch<RefreshTokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const response = NextResponse.json({
      access_token: data.access_token,
      message: "Token refreshed",
    });

    setAuthCookies(response, request, data);

    return response;
  } catch (error) {
    if (error instanceof BackendApiError) {
      // Clear cookies on refresh failure
      const response = NextResponse.json({ detail: "Session expired" }, { status: 401 });
      clearAuthCookies(response, request);

      return response;
    }
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
