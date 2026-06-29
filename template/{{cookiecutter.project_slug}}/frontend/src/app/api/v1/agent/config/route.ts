import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";

function authHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  const accessToken = request.cookies.get("access_token")?.value;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export async function GET(request: NextRequest) {
  try {
    const data = await backendFetch("/api/v1/agent/config", {
      headers: authHeaders(request),
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "Failed to fetch AI config" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.text();
    const data = await backendFetch("/api/v1/agent/config", {
      method: "PATCH",
      headers: authHeaders(request),
      body: body || "{}",
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { detail: error.message || "Failed to update AI config" },
        { status: error.status },
      );
    }
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
