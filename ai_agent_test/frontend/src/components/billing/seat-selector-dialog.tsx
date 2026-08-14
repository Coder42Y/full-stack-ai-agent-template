"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBilling, usePlans } from "@/hooks";

interface SeatSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * "checkout" (default) — starts a Stripe checkout session.
   * "update" — calls onUpdate(seats) to patch the existing subscription.
   */
  mode?: "checkout" | "update";
  initialSeats?: number;
  onUpdate?: (seats: number) => Promise<void>;
}

export function SeatSelectorDialog({
  open,
  onOpenChange,
  mode = "checkout",
  initialSeats = 5,
  onUpdate,
}: SeatSelectorDialogProps) {
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const { plans, isLoading: plansLoading } = usePlans();
  const { startCheckout, isLoading: checkoutLoading } = useBilling();
  const [seats, setSeats] = useState(initialSeats);
  const [isUpdating, setIsUpdating] = useState(false);

  const change = (delta: number) => setSeats((s) => Math.max(1, s + delta));

  const activePlan = plans.find((p) => p.prices.some((pr) => pr.is_active));
  const price = activePlan?.prices.find((pr) => pr.is_active && pr.interval === "month");
  const perSeat = price ? price.amount_cents / 100 : null;

  const fmt = (amount: number) =>
    amount.toLocaleString("en-US", {
      style: "currency",
      currency: price?.currency.toUpperCase() ?? "USD",
      minimumFractionDigits: 0,
    });

  const handleConfirm = async () => {
    if (mode === "update" && onUpdate) {
      setIsUpdating(true);
      await onUpdate(seats);
      setIsUpdating(false);
      onOpenChange(false);
      return;
    }
    await startCheckout({
      seats,
      price_id: price?.id,
      success_url: `${window.location.origin}/billing?success=1`,
      cancel_url: window.location.href,
    });
  };

  const busy = checkoutLoading || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "update" ? t("changeSeatCount") : t("chooseYourSeats")}
          </DialogTitle>
          <DialogDescription>
            {mode === "update" ? t("adjustSeatsDesc") : t("eachSeatDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="text-muted-foreground h-4 w-4" />
              {t("seats")}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => change(-1)}
                disabled={seats <= 1}
                aria-label={t("removeSeat")}
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <span
                className="w-8 text-center text-lg font-bold tabular-nums"
                aria-live="polite"
                aria-label={t("seatsSelected", { count: seats })}
              >
                {seats}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => change(1)}
                aria-label={t("addSeat")}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>

          {!plansLoading && perSeat !== null && (
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <div className="text-muted-foreground flex justify-between">
                <span>{t("perSeatPerMonth")}</span>
                <span>{fmt(perSeat)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2">
                <span className="font-semibold">{t("totalPerMonth")}</span>
                <span className="text-lg font-bold">{fmt(perSeat * seats)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy
              ? t("pleaseWait")
              : mode === "update"
                ? t("saveChanges")
                : t("continueToCheckout")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
