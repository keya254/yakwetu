"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "@/lib/auth-client";
import { normalisePhone } from "@/lib/phone";

export type Mode = "sign-in" | "sign-up";

export const COPY = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to pick up where you left off.",
    submit: "Sign in",
    switchText: "New to Yakwetu?",
    switchLink: "Create an account",
    switchHref: "/sign-up",
  },
  "sign-up": {
    title: "Create your account",
    description: "Free to join. You only pay for the films you watch.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/sign-in",
  },
} as const;

/** Only same-site paths are followed after sign-in. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/browse";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const copy = COPY[mode];

  return (
    <Card className="w-full max-w-sm gap-6 py-7 ring-foreground/10">
      <CardHeader className="px-7">
        <CardTitle className="text-2xl font-bold tracking-tight">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="px-7">
        <AuthFields
          mode={mode}
          onSuccess={() => {
            router.push(next);
            router.refresh();
          }}
        />
      </CardContent>
      <CardFooter className="justify-center border-t-0 bg-transparent px-7 pt-0 text-sm text-muted-foreground">
        {copy.switchText}&nbsp;
        <Link
          href={next === "/browse" ? copy.switchHref : `${copy.switchHref}?next=${encodeURIComponent(next)}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {copy.switchLink}
        </Link>
      </CardFooter>
    </Card>
  );
}

/**
 * The fields, validation and submit, without a frame: the sign-in and sign-up
 * pages wrap it in a card, the sign-up dialog in a dialog. Signs the viewer in
 * (sign-up signs in too) and hands over to `onSuccess`.
 */
export function AuthFields({ mode, onSuccess }: { mode: Mode; onSuccess: () => void }) {
  const copy = COPY[mode];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const phone = normalisePhone(String(form.get("phone") ?? ""));

    const errors: Record<string, string> = {};
    if (mode === "sign-up" && name.length < 2) errors.name = "Tell us your name.";
    if (mode === "sign-up" && password.length < 8) errors.password = "Use at least 8 characters.";
    if (mode === "sign-up" && phone && !/^\+\d{9,15}$/.test(phone)) errors.phone = "Use a number like 0712 345 678.";
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    const { error: authError } =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ name, email, password, ...(phone ? { phone } : {}) });
    setPending(false);

    if (authError) {
      setError(
        authError.status === 401 || authError.code === "INVALID_EMAIL_OR_PASSWORD"
          ? "That email and password don't match."
          : authError.code === "USER_ALREADY_EXISTS" || authError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "An account with this email already exists. Sign in instead."
            : (authError.message ?? "Something went wrong. Try again."),
      );
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {mode === "sign-up" && (
        <Field id="name" label="Full name" error={fieldErrors.name}>
          <Input id="name" name="name" autoComplete="name" placeholder="Wanjiku Mwangi" required aria-invalid={!!fieldErrors.name} />
        </Field>
      )}
      <Field id="email" label="Email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
      </Field>
      {mode === "sign-up" && (
        <Field id="phone" label="Phone" hint="Optional. For offers and payment help by SMS." error={fieldErrors.phone}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0712 345 678" aria-invalid={!!fieldErrors.phone} />
        </Field>
      )}
      <Field id="password" label="Password" error={fieldErrors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          aria-invalid={!!fieldErrors.password}
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full active:scale-[0.97]" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {copy.submit}
      </Button>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
