import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Library, Tag } from "lucide-react";
import { Poster } from "@/components/movie/poster";
import { MovieRow } from "@/components/movie/movie-row";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { getBecauseYouBought, getLibrary } from "@/lib/catalog/recommended";
import { formatKes } from "@/lib/format";
import { nudgeToken, priceOffer } from "@/lib/nudges";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "My films" };

/**
 * The viewer's library: every film they own (what they paid, when, how), the
 * offers still open for them, and what to buy next from the recommender,
 * anchored on their latest purchase.
 */
export default async function MyFilmsPage() {
  const session = await requireSession("/my-films");
  const userId = session.user.id;

  const [library, next, nudges] = await Promise.all([
    getLibrary(userId),
    getBecauseYouBought(userId),
    prisma.nudge.findMany({ where: { userId, convertedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" }, take: 3 }),
  ]);
  const offers = (
    await Promise.all(
      nudges.map(async (nudge) => {
        const priced = await priceOffer(userId, nudge.movieIds, nudge.discountPct);
        return priced.films.length ? { nudge, priced } : null;
      }),
    )
  ).filter((offer) => offer !== null);
  const totalSpent = library.reduce((sum, item) => sum + (item.paidKes ?? 0), 0);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-16">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">My films</h1>
          <p className="mt-2 text-muted-foreground">
            {library.length
              ? `${library.length} film${library.length === 1 ? "" : "s"} in your library · ${formatKes(totalSpent)} spent, yours to keep.`
              : "Films you buy live here, yours to keep."}
          </p>

          {offers.length > 0 && (
            <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map(({ nudge, priced }) => (
                <Link
                  key={nudge.id}
                  href={`/c/${nudgeToken(nudge.id)}`}
                  className="flex items-start gap-3 rounded-xl bg-primary/10 p-4 ring-1 ring-primary/25 transition-colors hover:bg-primary/15"
                >
                  <Tag className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{priced.films.map((film) => film.title).join(" + ")}</span>
                    <span className="block text-sm text-muted-foreground">
                      {formatKes(priced.totalKes)}
                      {nudge.discountPct ? ` · ${nudge.discountPct}% off` : ""} · ends{" "}
                      {nudge.expiresAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}
                    </span>
                  </span>
                </Link>
              ))}
            </section>
          )}

          {library.length === 0 ? (
            <div className="mt-12 flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
              <Library className="size-10 text-muted-foreground" />
              <p className="mt-4 font-medium">Nothing here yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Buy a film once with M-Pesa or card and it stays in your library.</p>
              <Button asChild className="mt-6">
                <Link href="/browse">Browse films</Link>
              </Button>
            </div>
          ) : (
            <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {library.map((item) => (
                <li key={item.movie.id}>
                  <Link href={`/movie/${item.movie.id}`} className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Poster
                      title={item.movie.title}
                      posterUrl={item.movie.posterUrl}
                      year={item.movie.year}
                      sizes="(min-width: 1024px) 180px, 45vw"
                      className="rounded-lg ring-1 ring-foreground/10 transition-[box-shadow] duration-150 group-hover:ring-foreground/30"
                    />
                    <p className="mt-2 truncate text-sm font-medium">{item.movie.title}</p>
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {item.purchasedAt.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                    {item.paidKes !== null && ` · ${formatKes(item.paidKes)}${item.discounted ? " (offer)" : ""}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {next && (
          <div className="mt-14">
            <MovieRow title={`Because you bought ${next.anchorTitle}`} description="Picked by our recommender from what you own and browse." movies={next.movies} />
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
