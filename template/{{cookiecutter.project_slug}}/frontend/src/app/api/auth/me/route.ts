import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import type { User } from "@/types";

function unauthenticatedResponse(request: NextRequest, detail = "Not authenticated") {
  const response = NextResponse.json({ detail }, { status: 401 });
  clearAuthCookies(response, request);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return unauthenticatedResponse(request);
    }

    const data = await backendFetch<User>("/api/v1/auth/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Return the access token alongside user data so the client can use it
    // for WebSocket auth via Sec-WebSocket-Protocol. Security tradeoff: this
    // exposes the httpOnly cookie to JS, same as the cross-origin WS needs.
    return NextResponse.json({ ...data, access_token: accessToken });
  } catch (error) {
    if (error instanceof BackendApiError) {
      if (error.status === 401 || error.status === 404 || error.status >= 500) {
        return unauthenticatedResponse(request, "Session expired");
      }
      return NextResponse.json({ detail: "Failed to get user" }, { status: error.status });
    }
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
