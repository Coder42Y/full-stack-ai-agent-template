import type { NextRequest, NextResponse } from "next/server";

export function shouldUseSecureCookies(request: NextRequest) {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function setAuthCookies(
  response: NextResponse,
  request: NextRequest,
  tokens: { access_token: string; refresh_token?: string },
) {
  const secure = shouldUseSecureCookies(request);
  response.cookies.set("access_token", tokens.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  if (tokens.refresh_token) {
    response.cookies.set("refresh_token", tokens.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
  }
}

export function clearAuthCookies(response: NextResponse, request: NextRequest) {
  const secure = shouldUseSecureCookies(request);
  for (const name of ["access_token", "refresh_token"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }
}
