import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { Poster } from "@/components/movie/poster";
import { getSession } from "@/lib/auth";
import { getPosterWall } from "@/lib/catalog/queries";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // A real, verified session sends you on; a stale cookie does not.
  if (await getSession()) redirect("/browse");
  const posters = await getPosterWall(12);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <Wordmark />
        <div className="flex flex-1 items-center justify-center py-12">{children}</div>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border lg:block" aria-hidden>
        <div className="grid -rotate-6 scale-125 grid-cols-4 gap-3 p-6 opacity-70">
          {posters.map((poster) => (
            <Poster key={poster.id} title={poster.title} posterUrl={poster.posterUrl} sizes="200px" className="rounded-md" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="font-heading max-w-md text-3xl leading-tight font-bold tracking-tight">
            Nairobi Half Life, Supa Modo, Mami Wata — and dozens more waiting.
          </p>
        </div>
      </aside>
    </div>
  );
}
