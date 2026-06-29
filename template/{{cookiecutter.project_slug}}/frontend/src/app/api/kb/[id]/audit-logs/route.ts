import { NextResponse, type NextRequest } from "next/server";

import { BackendApiError, backendFetch } from "@/lib/server-api";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get("limit") ?? "50";
  try {
    const data = await backendFetch(`/api/v1/kb/${id}/audit-logs?limit=${encodeURIComponent(limit)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
