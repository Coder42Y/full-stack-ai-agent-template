import { NextResponse, type NextRequest } from "next/server";

import { BackendApiError, backendFetch } from "@/lib/server-api";

interface RouteParams {
  params: Promise<{ id: string; docId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const { id, docId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const paramsToForward: Record<string, string> = {};
  for (const key of ["from_version", "to_version"]) {
    const value = searchParams.get(key);
    if (value) paramsToForward[key] = value;
  }

  try {
    const data = await backendFetch(`/api/v1/kb/${id}/documents/${docId}/diff`, {
      params: paramsToForward,
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
