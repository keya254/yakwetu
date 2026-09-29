"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { ConfettiBurst } from "@/components/checkout/confetti-burst";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { track } from "@/lib/events/client";
import { formatKes } from "@/lib/format";
import { normalisePhone, validPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

interface BuyButtonProps {
  movieId: string;
  title: string;
  priceKes: number;
  signedIn: boolean;
  owned: boolean;
  /** From a nudge link: the server takes films, discount and attribution from it. */
  nudgeToken?: string;
  /** Replaces "Buy for KES …" (e.g. "Pay KES 179 · 10% off"). */
  label?: string;
  /** Signed in without a phone: offer an optional field, so a failed payment can be rescued by SMS. */
  askPhone?: boolean;
  /** Full-width card button, or the compact one in the mobile bar. */
  variant?: "card" | "compact" | "inline";
}

type Phase = "idle" | "starting" | "paying" | "confirming";

const FAILURE_COPY: Record<string, string> = {
  insufficient_funds: "Your balance was too low. Top up and try again: your film is saved.",
  wrong_pin: "The PIN didn't match. Try again.",
  timeout_or_cancel: "The payment prompt timed out. Try again when your phone is ready.",
  limit_exceeded: "That's over your M-Pesa limit. Try a card instead.",
  amount_mismatch: "Something didn't add up with that payment. You haven't been charged twice; try again.",
  declined: "The payment was declined. Try again, or use another way to pay.",
};

const POLL_MS = 2_000;
const POLL_FOR_MS = 40_000;

/**
 * Buy one film with Paystack (M-Pesa or card). The server prices it and opens
 * the transaction; this only opens Paystack's popup with the access code, then
 * asks the server whether Paystack confirmed it. Confetti when it did.
 *
 * - Signed out: the sign-up dialog first, then straight on to payment.
 * - Popup blocked or failing: falls back to Paystack's hosted checkout page.
 * - M-Pesa still settling after 40 s: says so. The delayed check on RabbitMQ
 *   unlocks the film when Paystack confirms, even if this tab is closed.
 */
export function BuyButton({ movieId, title, priceKes, signedIn, owned: ownedAtLoad, nudgeToken, label, askPhone = false, variant = "inline" }: BuyButtonProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [owned, setOwned] = useState(ownedAtLoad);
  const [celebrating, setCelebrating] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function confirm(reference: string) {
    setPhase("confirming");
    const until = Date.now() + POLL_FOR_MS;
    while (Date.now() < until) {
      const response = await fetch(`/api/checkout/${encodeURIComponent(reference)}`, { cache: "no-store" }).catch(() => null);
      const result = (await response?.json().catch(() => null)) as { status?: string; failureReason?: string | null } | null;
      if (result?.status === "succeeded") {
        setOwned(true);
        setCelebrating(true);
        setPhase("idle");
        toast.success(`${title} is yours.`, { description: "It's in your library. Enjoy the film!" });
        router.refresh();
        return;
      }
      if (result?.status === "failed" || result?.status === "abandoned") {
        setPhase("idle");
        toast.error("Payment didn't go through", { description: FAILURE_COPY[result.failureReason ?? "declined"] ?? FAILURE_COPY.declined });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    setPhase("idle");
    toast("Still confirming with M-Pesa", { description: "We'll unlock the film the moment the payment lands. You can leave this page." });
  }

  /** `justSignedIn`: the dialog signed them in; the server props haven't caught up yet. */
  async function buy(justSignedIn = false) {
    if (!signedIn && !justSignedIn) {
      setAuthOpen(true);
      return;
    }
    if (askPhone && phone.trim()) {
      const normalised = normalisePhone(phone);
      if (!validPhone(normalised)) {
        setPhoneError("Use a number like 0712 345 678, or leave it empty.");
        return;
      }
      setPhoneError(null);
      // Saved before paying, so a failed payment can still reach them. Not blocking if it fails.
      await authClient.updateUser({ phone: normalised }).catch(() => undefined);
    }
    setPhase("starting");
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nudgeToken ? { nudgeToken } : { movieIds: [movieId] }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as
      | { reference: string; accessCode: string; authorizationUrl: string; orderId: string; error?: string; code?: string }
      | null;

    if (!response?.ok || !body?.accessCode) {
      setPhase("idle");
      if (body?.code === "already_owned") {
        setOwned(true);
        router.refresh();
        return;
      }
      toast.error(body?.error ?? "Couldn't start the payment. Check your connection and try again.");
      return;
    }

    setPhase("paying");
    try {
      const { default: PaystackPop } = await import("@paystack/inline-js");
      new PaystackPop().resumeTransaction(body.accessCode, {
        onSuccess: () => void confirm(body.reference),
        onCancel: () => {
          setPhase("idle");
          track("checkout.cancelled", { reference: body.reference, orderId: body.orderId, movieId });
          toast("Payment cancelled", { description: `${title} is still here when you're ready.` });
        },
        onError: () => window.location.assign(body.authorizationUrl),
      });
    } catch {
      // The popup script couldn't load (blocked, offline): Paystack's hosted page works the same way.
      window.location.assign(body.authorizationUrl);
    }
  }

  const sizing = variant === "card" ? "h-12 w-full text-base" : variant === "compact" ? "h-10 px-5" : "min-w-44";

  if (owned) {
    return (
      <>
        {celebrating && <ConfettiBurst onDone={() => setCelebrating(false)} />}
        <Button asChild size="lg" variant="secondary" className={cn(sizing, "active:scale-[0.97]")}>
          <Link href="/my-films">
            <Library className="size-4" /> In My films
          </Link>
        </Button>
      </>
    );
  }

  const busy = phase !== "idle";
  return (
    <>
      {askPhone && signedIn && variant === "card" && (
        <div className="mb-3 space-y-1.5 text-left">
          <label htmlFor={`phone-${movieId}`} className="text-xs text-muted-foreground">
            Phone for M-Pesa and payment help <span className="text-muted-foreground/70">(optional)</span>
          </label>
          <Input
            id={`phone-${movieId}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={Boolean(phoneError)}
          />
          {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
        </div>
      )}
      <Button size="lg" onClick={() => void buy()} disabled={busy} className={cn(sizing, "active:scale-[0.97]")}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {phase === "starting" ? "Opening checkout…" : phase === "paying" ? "Complete payment…" : phase === "confirming" ? "Confirming…" : (label ?? `Buy for ${formatKes(priceKes)}`)}
      </Button>
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        reason={`Create a free account to buy ${title}. It takes a few seconds.`}
        onSignedIn={() => {
          setAuthOpen(false);
          router.refresh();
          // Signed in now: carry on to payment without a second press.
          void buy(true);
        }}
      />
    </>
  );
}
