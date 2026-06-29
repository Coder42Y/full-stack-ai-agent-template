import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import type { RegisterResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = {
      email: body.email,
      password: body.password,
      full_name: body.full_name,
      role: "product",
    };

    const data = await backendFetch<RegisterResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof BackendApiError) {
      const detail = (error.data as { detail?: string })?.detail || "注册失败";
      return NextResponse.json({ detail }, { status: error.status });
    }
    return NextResponse.json({ detail: "服务暂不可用" }, { status: 500 });
  }
}
