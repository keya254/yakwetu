import Link from "next/link";
import { Check, Clock, Lock, Tag } from "lucide-react";
import { BuyButton } from "@/components/checkout/buy-button";
import { formatKes, formatRuntime } from "@/lib/format";
import type { PurchaseState } from "@/lib/purchase";
import { cn } from "@/lib/utils";

interface PurchaseCardProps {
  movie: { id: string; title: string; priceKes: number; runtimeMin: number | null; languages: string[] };
  state: PurchaseState;
  signedIn: boolean;
  className?: string;
}

const PAY_MARKS = ["M-PESA", "Airtel Money", "Visa", "Mastercard"];

/**
 * The decision box: what it costs, what you get, how you pay. Sits beside the
 * title (sticky on desktop), so the price and the button are never below the
 * fold. Owners get "Watch now"; a viewer with a live nudge offer sees it here.
 */
export function PurchaseCard({ movie, state, signedIn, className }: PurchaseCardProps) {
  const facts = [
    "HD, on your phone, laptop or TV",
    movie.runtimeMin ? `${formatRuntime(movie.runtimeMin)}, watch at your own pace` : "Watch at your own pace",
    movie.languages.length ? movie.languages.slice(0, 3).join(", ") : null,
  ].filter(Boolean) as string[];

  if (state.owned) {
    return (
      <aside className={cn("rounded-2xl bg-card/80 p-6 ring-1 ring-foreground/10 backdrop-blur", className)}>
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <Check className="size-4" /> In your library
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Since {state.ownedSince?.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
          {state.completed ? " · watched" : ""}
        </p>
        <div className="mt-5">
          <BuyButton movieId={movie.id} title={movie.title} priceKes={movie.priceKes} signedIn owned variant="card" />
        </div>
      </aside>
    );
  }

  return (
    <aside className={cn("rounded-2xl bg-card/80 p-6 ring-1 ring-foreground/10 backdrop-blur", className)}>
      {state.offer ? (
        <Link
          href={state.offer.url}
          className="mb-4 flex items-start gap-2.5 rounded-lg bg-primary/12 px-3 py-2.5 text-sm ring-1 ring-primary/30 transition-colors hover:bg-primary/18"
        >
          <Tag className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-foreground">Your offer: {formatKes(state.offer.totalKes)}</span>{" "}
            <span className="text-muted-foreground">
              ({state.offer.discountPct}% off, ends {state.offer.expiresAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })})
            </span>
          </span>
        </Link>
      ) : null}

      <p className="text-4xl font-extrabold tracking-tight tabular-nums">{formatKes(movie.priceKes)}</p>
      <p className="mt-1 text-sm text-muted-foreground">Yours to keep. One payment, no subscription.</p>

      <ul className="mt-5 space-y-2 text-sm">
        {facts.map((fact) => (
          <li key={fact} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="text-foreground/90">{fact}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <BuyButton movieId={movie.id} title={movie.title} priceKes={movie.priceKes} signedIn={signedIn} owned={false} askPhone={signedIn && !state.hasPhone} variant="card" />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {PAY_MARKS.map((mark) => (
          <span key={mark} className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
            {mark}
          </span>
        ))}
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" /> Secured by Paystack
        <span aria-hidden>·</span>
        <Clock className="size-3" /> Unlocks instantly
      </p>
    </aside>
  );
}

/** Phones: the price and the button stay one tap away while scrolling. */
export function MobileBuyBar({ movie, state, signedIn }: Omit<PurchaseCardProps, "className">) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/92 px-4 py-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{movie.title}</p>
          <p className="text-xs text-muted-foreground">
            {state.owned ? "In your library" : state.offer ? `Your offer ${formatKes(state.offer.totalKes)}` : `${formatKes(movie.priceKes)} · M-Pesa or card`}
          </p>
        </div>
        {state.offer && !state.owned ? (
          <Link href={state.offer.url} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">
            Use offer
          </Link>
        ) : (
          <BuyButton movieId={movie.id} title={movie.title} priceKes={movie.priceKes} signedIn={signedIn} owned={state.owned} variant="compact" label={`Buy · ${formatKes(movie.priceKes)}`} />
        )}
      </div>
    </div>
  );
}
