import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group/brand flex items-baseline gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="font-heading text-lg font-extrabold tracking-tight text-foreground">Yakwetu</span>
      <span className="text-sm font-medium text-primary">Sinema</span>
    </Link>
  );
}
