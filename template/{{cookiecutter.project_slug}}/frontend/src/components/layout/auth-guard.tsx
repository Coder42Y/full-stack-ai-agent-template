"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores";
import { apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import type { User } from "@/types";
import { Spinner } from "@/components/ui";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, setUser } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      try {
        const data = await apiClient.get<User & { access_token?: string }>("/auth/me");
        const { access_token, ...user } = data;
        if (cancelled) return;
        setUser(user as User);
        useAuthStore.getState().setAccessToken(access_token ?? null);
      } catch {
        try {
          const data = await apiClient.post<User & { access_token?: string }>("/auth/demo-admin");
          const { access_token, ...demoUser } = data;
          if (cancelled) return;
          setUser(demoUser as User);
          useAuthStore.getState().setAccessToken(access_token ?? null);
          router.refresh();
        } catch {
          if (cancelled) return;
          useAuthStore.getState().setAccessToken(null);
          router.replace(ROUTES.LOGIN);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [router, setUser]);

  if (checking || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center" role="status" aria-live="polite">
        <Spinner className="text-muted-foreground h-6 w-6" />
        <span className="sr-only">正在建立演示会话...</span>
      </div>
    );
  }

  return <>{children}</>;
}
