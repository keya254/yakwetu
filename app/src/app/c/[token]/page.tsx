import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { BuyButton } from "@/components/checkout/buy-button";
import { Poster } from "@/components/movie/poster";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { emitServerEvent } from "@/lib/events/server";
import { formatKes } from "@/lib/format";
import { priceOffer, resolveNudgeToken } from "@/lib/nudges";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Your offer" };

const HEADLINES: Record<string, string> = {
  B: "Finish your purchase",
  A: "Still thinking about it?",
  C: "Your next watch",
  welcome: "Start watching",
};

/**
 * Where a nudge SMS lands. The token is checked (signature, expiry, used,
 * right account), the offer is priced by the server, and payment goes through
 * the normal checkout with the nudge attached, so a successful payment
 * credits this nudge (KES recovered per scenario).
 */
export default async function NudgeOfferPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/c/${token}`)}`);

  const resolved = await resolveNudgeToken(token);
  const nudge = resolved.state === "invalid" ? null : resolved.nudge;
  const wrongAccount = nudge && nudge.userId !== session.user.id;

  if (!nudge || wrongAccount || resolved.state !== "valid") {
    const firstFilm = nudge?.movieIds[0];
    const message = !nudge
      ? "This link isn't valid."
      : wrongAccount
        ? "This offer was sent to a different account."
        : resolved.state === "used"
          ? "You've already used this offer. Enjoy the film!"
          : "This offer has ended, but the film is still here.";
    return (
      <Shell>
        <h1 className="text-3xl font-bold tracking-tight">{message}</h1>
        <div className="mt-8 flex justify-center gap-3">
          {firstFilm && !wrongAccount && (
            <Button asChild>
              <Link href={`/movie/${firstFilm}`}>Go to the film</Link>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href="/browse">Browse</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (!nudge.openedAt) {
    await prisma.nudge.update({ where: { id: nudge.id }, data: { openedAt: new Date() } });
    await emitServerEvent("nudge.opened", session.user.id, {
      nudgeId: nudge.id,
      scenario: nudge.scenario,
      step: nudge.step,
      movieIds: nudge.movieIds,
      discountPct: nudge.discountPct,
    });
  }

  const offer = await priceOffer(session.user.id, nudge.movieIds, nudge.discountPct);
  const posters = await prisma.movie.findMany({ where: { id: { in: offer.films.map((film) => film.id) } }, select: { id: true, posterUrl: true, year: true } });
  const ends = nudge.expiresAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
  const title = offer.films.map((film) => film.title).join(" + ");

  return (
    <Shell>
      <p className="text-sm font-medium tracking-wide text-primary uppercase">{nudge.discountPct ? `${nudge.discountPct}% off, just for you` : "Saved for you"}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{HEADLINES[nudge.scenario] ?? "Your offer"}</h1>

      {offer.films.length === 0 ? (
        <p className="mt-6 text-muted-foreground">You already own everything in this offer.</p>
      ) : (
        <>
          <ul className="mx-auto mt-8 flex max-w-md justify-center gap-4">
            {offer.films.map((film) => {
              const poster = posters.find((row) => row.id === film.id);
              return (
                <li key={film.id} className="w-32 sm:w-36">
                  <Link href={`/movie/${film.id}`}>
                    <Poster title={film.title} posterUrl={poster?.posterUrl ?? null} year={poster?.year} sizes="144px" className="rounded-md ring-1 ring-foreground/10" />
                  </Link>
                  <p className="mt-2 truncate text-sm font-medium">{film.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatKes(film.priceKes)}</p>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 flex flex-col items-center gap-2">
            <p className="text-lg tabular-nums">
              {offer.discountKes > 0 && <span className="mr-2 text-muted-foreground line-through">{formatKes(offer.subtotalKes)}</span>}
              <span className="font-bold text-primary">{formatKes(offer.totalKes)}</span>
            </p>
            <BuyButton
              movieId={offer.films[0].id}
              title={title}
              priceKes={offer.totalKes}
              signedIn
              owned={false}
              nudgeToken={token}
              label={`Pay ${formatKes(offer.totalKes)}${nudge.discountPct ? ` · ${nudge.discountPct}% off` : ""}`}
            />
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5" /> Offer ends at {ends}. M-Pesa or card.
            </p>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl text-center">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
