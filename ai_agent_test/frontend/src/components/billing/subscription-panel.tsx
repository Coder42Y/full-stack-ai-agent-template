"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSubscription, useBilling } from "@/hooks";
import { SeatSelectorDialog } from "./seat-selector-dialog";
import type { SubscriptionRead } from "@/types";

function StatusBadge({ status }: { status: SubscriptionRead["status"] }) {
  const t = useTranslations("billing");
  const map: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    active: { label: t("statusActive"), variant: "default" },
    trialing: { label: t("statusTrialing"), variant: "secondary" },
    past_due: { label: t("statusPastDue"), variant: "destructive" },
    canceled: { label: t("statusCanceled"), variant: "outline" },
    unpaid: { label: t("statusUnpaid"), variant: "destructive" },
    paused: { label: t("statusPaused"), variant: "secondary" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}

function StatusIcon({ status }: { status: SubscriptionRead["status"] }) {
  if (status === "active") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "trialing") return <Clock className="h-5 w-5 text-blue-500" />;
  if (status === "canceled") return <XCircle className="text-muted-foreground h-5 w-5" />;
  return <AlertCircle className="text-destructive h-5 w-5" />;
}

export function SubscriptionPanel() {
  const t = useTranslations("billing");
  const { subscription, isLoading, cancelSubscription, reactivateSubscription, updateSeats } =
    useSubscription();
  const { isLoading: billingLoading, openPortal, startCheckout } = useBilling();
  const [canceling, setCanceling] = useState(false);
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("subscriptionNav")}</CardTitle>
          <CardDescription>{t("loadingSubscription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-24 animate-pulse rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("noActiveSubscriptionTitle")}</CardTitle>
          <CardDescription>{t("upgradePremium")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t("onFreePlan")}</p>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() =>
              startCheckout({
                success_url: window.location.href + "?success=1",
                cancel_url: window.location.href,
              })
            }
            disabled={billingLoading}
          >
            {t("viewPlans")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const planName = subscription.price?.plan?.display_name ?? t("subscriptionNav");
  const periodEnd = format(new Date(subscription.current_period_end), "MMM d, yyyy");
  const trialEnd = subscription.trial_end
    ? format(new Date(subscription.trial_end), "MMM d, yyyy")
    : null;
  const intervalLabel =
    subscription.price?.interval === "month"
      ? t("intervalMonth")
      : subscription.price?.interval === "year"
        ? t("intervalYear")
        : subscription.price?.interval;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon status={subscription.status} />
              <CardTitle>{planName}</CardTitle>
            </div>
            <StatusBadge status={subscription.status} />
          </div>
          <CardDescription>
            {subscription.status === "trialing" && trialEnd
              ? t("trialEnds", { date: trialEnd })
              : t("renewsDate", { date: periodEnd })}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">{t("seats")}</p>
              <p className="font-medium">{subscription.seats_quantity}</p>
            </div>
            {subscription.price && (
              <div>
                <p className="text-muted-foreground">{t("price")}</p>
                <p className="font-medium">
                  {(subscription.price.amount_cents / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: subscription.price.currency.toUpperCase(),
                  })}{" "}
                  / {intervalLabel}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">{t("billingPeriodEnds")}</p>
              <p className="font-medium">{periodEnd}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("autoRenew")}</p>
              <p className="font-medium">{subscription.cancel_at_period_end ? t("off") : t("on")}</p>
            </div>
          </div>

          {subscription.cancel_at_period_end && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t.rich("willCancel", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                  date: periodEnd,
                })}
              </AlertDescription>
            </Alert>
          )}

          {subscription.status === "past_due" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t("paymentFailed")}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button variant="outline" onClick={openPortal} disabled={billingLoading}>
            {t("manageBilling")}
          </Button>

          <Button
            variant="outline"
            onClick={() => setSeatDialogOpen(true)}
            disabled={billingLoading}
          >
            {t("changeSeats")}
          </Button>

          {subscription.cancel_at_period_end ? (
            <Button onClick={reactivateSubscription} disabled={billingLoading}>
              {t("reactivate")}
            </Button>
          ) : subscription.status !== "canceled" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive">
                  {t("cancelSubscription")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("cancelSubscriptionTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t.rich("willRemainActive", {
                      strong: (chunks) => <strong>{chunks}</strong>,
                      date: periodEnd,
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("keepSubscription")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      setCanceling(true);
                      await cancelSubscription();
                      setCanceling(false);
                    }}
                    disabled={canceling}
                  >
                    {t("yesCancel")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </CardFooter>
      </Card>

      <SeatSelectorDialog
        open={seatDialogOpen}
        onOpenChange={setSeatDialogOpen}
        mode="update"
        initialSeats={subscription.seats_quantity}
        onUpdate={updateSeats}
      />
    </>
  );
}
