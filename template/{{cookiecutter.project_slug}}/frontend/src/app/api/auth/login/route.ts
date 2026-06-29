import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError } from "@/lib/server-api";
import { setAuthCookies } from "@/lib/auth-cookies";
import { isLoginRole, roleLabel } from "@/lib/auth-roles";
import type { LoginResponse, User } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const selectedRole = body.role;
    if (!isLoginRole(selectedRole)) {
      return NextResponse.json({ detail: "请选择登录身份" }, { status: 400 });
    }

    // Backend expects OAuth2 form data format
    const formData = new URLSearchParams();
    formData.append("username", body.email);
    formData.append("password", body.password);

    const data = await backendFetch<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    // Fetch user profile with the new token
    const user = await backendFetch<User>("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    if (user.role !== selectedRole) {
      return NextResponse.json(
        {
          detail: `该账号不是 ${roleLabel(selectedRole)} 身份，请选择匹配的身份或注册新账号。`,
        },
        { status: 403 },
      );
    }

    // Set HTTP-only cookies for tokens. Also return the access_token in the
    // body so the client can use it for cross-origin WebSocket auth.
    const response = NextResponse.json({
      user,
      access_token: data.access_token,
      message: "登录成功",
    });

    setAuthCookies(response, request, data);

    return response;
  } catch (error) {
    if (error instanceof BackendApiError) {
      const detail = (error.data as { detail?: string })?.detail || "登录失败";
      return NextResponse.json({ detail }, { status: error.status });
    }
    return NextResponse.json({ detail: "服务暂不可用" }, { status: 500 });
  }
}
