"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useInvitations, useAuth } from "@/hooks";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function AcceptInvitationPage({ params }: PageProps) {
  const { token } = use(params);
  const t = useTranslations("invitations");
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { acceptInvitation } = useInvitations("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/invitations/${token}`);
    }
  }, [isAuthenticated, router, token]);

  const handleAccept = async () => {
    setStatus("loading");
    try {
      await acceptInvitation(token);
      setStatus("success");
      setTimeout(() => router.push("/orgs"), 2000);
    } catch {
      setStatus("error");
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm font-medium">{t("acceptSuccess")}</p>
              <p className="text-muted-foreground text-xs">{t("redirecting")}</p>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="text-destructive h-12 w-12" />
              <p className="text-sm font-medium">{t("failedTitle")}</p>
              <p className="text-muted-foreground text-xs">{t("failedDesc")}</p>
              <Button variant="outline" onClick={() => router.push("/dashboard")}>
                {t("goDashboard")}
              </Button>
            </>
          )}
          {(status === "idle" || status === "loading") && (
            <>
              {status === "loading" && <Loader2 className="text-primary h-8 w-8 animate-spin" />}
              <p className="text-muted-foreground text-sm">{t("acceptHint")}</p>
              <Button onClick={handleAccept} disabled={status === "loading"} className="w-full">
                {status === "loading" ? t("accepting") : t("accept")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
