import { NextResponse, type NextRequest } from "next/server";

import { BackendApiError, backendFetch } from "@/lib/server-api";
import { requirementRoleHeaders } from "@/lib/requirement-role";

interface RouteParams {
  params: Promise<{ id: string; docId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const { id, docId } = await params;
  try {
    const data = await backendFetch(`/api/v1/kb/${id}/documents/${docId}/apply-draft`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...requirementRoleHeaders(request.headers.get("X-Requirement-Role")),
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
