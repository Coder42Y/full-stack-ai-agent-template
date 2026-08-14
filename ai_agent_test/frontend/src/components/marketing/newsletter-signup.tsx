"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

export function NewsletterSignup() {
  const t = useTranslations("marketing.newsletter");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await apiClient.post("/newsletter/signup", { email });
      setDone(true);
      toast.success(t("successToast"));
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <p className="text-muted-foreground text-center text-sm">{t("thanks")}</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md gap-2">
      <Input
        type="email"
        placeholder={t("placeholder")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="flex-1"
      />
      <Button type="submit" disabled={loading}>
        {loading ? t("subscribing") : t("subscribe")}
      </Button>
    </form>
  );
}
