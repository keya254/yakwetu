"use client";

import { useState } from "react";
import { ConfettiBurst } from "@/components/checkout/confetti-burst";

export function ReturnCelebration() {
  const [show, setShow] = useState(true);
  return show ? <ConfettiBurst onDone={() => setShow(false)} /> : null;
}
