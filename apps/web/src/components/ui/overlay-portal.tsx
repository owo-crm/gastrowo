import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

let overlayLockCount = 0;
let lockedScrollY = 0;
let previousBodyPosition = "";
let previousBodyTop = "";
let previousBodyLeft = "";
let previousBodyRight = "";
let previousBodyWidth = "";
let previousBodyOverflow = "";
let previousHtmlOverflow = "";
let previousBodyOverscrollBehavior = "";
let previousHtmlOverscrollBehavior = "";

export function OverlayPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;

    const { body, documentElement } = document;

    if (overlayLockCount === 0) {
      lockedScrollY = window.scrollY;
      previousBodyPosition = body.style.position;
      previousBodyTop = body.style.top;
      previousBodyLeft = body.style.left;
      previousBodyRight = body.style.right;
      previousBodyWidth = body.style.width;
      previousBodyOverflow = body.style.overflow;
      previousHtmlOverflow = documentElement.style.overflow;
      previousBodyOverscrollBehavior = body.style.overscrollBehavior;
      previousHtmlOverscrollBehavior = documentElement.style.overscrollBehavior;

      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      documentElement.style.overflow = "hidden";
      documentElement.style.overscrollBehavior = "none";
    }

    overlayLockCount += 1;

    return () => {
      overlayLockCount = Math.max(overlayLockCount - 1, 0);
      if (overlayLockCount > 0) return;

      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      window.scrollTo(0, lockedScrollY);
    };
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
