"use client";

import { useState } from "react";
import { AuthFields, COPY, type Mode } from "@/components/auth/auth-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the viewer is signed in (a new account signs in straight away). */
  onSignedIn: () => void;
  /** Shown above the form, e.g. why we're asking. */
  reason?: string;
}

/**
 * Sign-up (or sign-in) without leaving the page: the viewer who pressed play
 * stays on the film and it starts as soon as they're in. Opens on sign-up, the
 * likelier case for someone who isn't signed in yet.
 */
export function AuthDialog({ open, onOpenChange, onSignedIn, reason }: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>("sign-up");
  const copy = COPY[mode];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setMode("sign-up");
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto p-6 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">{copy.title}</DialogTitle>
          <DialogDescription>{reason ?? copy.description}</DialogDescription>
        </DialogHeader>
        {/* Keyed by mode so switching clears the other form's errors. */}
        <AuthFields key={mode} mode={mode} onSuccess={onSignedIn} />
        <p className="text-center text-sm text-muted-foreground">
          {copy.switchText}&nbsp;
          <button
            type="button"
            onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {copy.switchLink}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
