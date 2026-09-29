import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ReturnCelebration } from "@/components/checkout/return-celebration";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { settlePayment } from "@/lib/payments/service";

export const metadata: Metadata = { title: "Payment" };

/**
 * Where Paystack's hosted checkout sends the viewer back (the fallback when
 * the popup can't open). Settles the payment through the same idempotent path
 * as the popup, the webhook and the delayed check.
 */
export default async function CheckoutReturnPage({ searchParams }: PageProps<"/checkout/return">) {
  const params = await searchParams;
  const reference = typeof params.reference === "string" ? params.reference : typeof params.trxref === "string" ? params.trxref : null;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/checkout/return?reference=${reference ?? ""}`)}`);

  const payment = reference ? await prisma.payment.findUnique({ where: { reference }, include: { order: true } }) : null;
  if (!payment || payment.userId !== session.user.id) redirect("/browse");

  const settlement = await settlePayment(payment.reference, "return").catch(() => null);
  const status = settlement?.status ?? payment.status;
  const movies = await prisma.movie.findMany({ where: { id: { in: payment.order.movieIds } }, select: { id: true, title: true } });
  const first = movies[0];

  const view =
    status === "succeeded"
      ? { icon: <CheckCircle2 className="size-12 text-primary" />, title: `${movies.map((m) => m.title).join(", ")} ${movies.length > 1 ? "are" : "is"} yours`, body: "It's in your library. Enjoy the film!" }
      : status === "failed" || status === "abandoned"
        ? { icon: <XCircle className="size-12 text-destructive" />, title: "Payment didn't go through", body: "You haven't been charged. Your film is still there when you want to try again." }
        : { icon: <Clock className="size-12 text-muted-foreground" />, title: "Confirming your payment", body: "M-Pesa can take a minute. We'll unlock the film the moment it lands; you can leave this page." };

  return (
    <>
      <SiteHeader />
      {status === "succeeded" && <ReturnCelebration />}
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex justify-center">{view.icon}</div>
          <h1 className="text-3xl font-bold tracking-tight">{view.title}</h1>
          <p className="mt-3 text-muted-foreground">{view.body}</p>
          <div className="mt-8 flex justify-center gap-3">
            {first && (
              <Button asChild>
                <Link href={`/movie/${first.id}`}>{status === "succeeded" ? "Go to the film" : "Back to the film"}</Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/browse">Browse</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
