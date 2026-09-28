import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

export async function SiteHeader() {
  const session = await getSession();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Wordmark href={user ? "/browse" : "/"} />
          {user && (
            <nav className="hidden items-center gap-6 text-sm sm:flex">
              <Link href="/browse" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
                Browse
              </Link>
            </nav>
          )}
        </div>
        {user ? (
          <UserMenu name={user.name} email={user.email} />
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Join free</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
