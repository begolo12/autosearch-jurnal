"use client";

import { useEffect } from "react";

let activeLockCount = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";
let savedBodyPaddingRight = "";

export function useBodyScrollLock(locked = true) {
  useEffect(() => {
    if (!locked || typeof window === "undefined") return;

    const html = document.documentElement;
    const body = document.body;

    if (activeLockCount === 0) {
      savedHtmlOverflow = html.style.overflow;
      savedBodyOverflow = body.style.overflow;
      savedBodyPaddingRight = body.style.paddingRight;

      const scrollbarWidth = window.innerWidth - html.clientWidth;
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }

      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      html.setAttribute("data-modal-open", "true");
    }

    activeLockCount += 1;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0) {
        html.style.overflow = savedHtmlOverflow;
        body.style.overflow = savedBodyOverflow;
        body.style.paddingRight = savedBodyPaddingRight;
        html.removeAttribute("data-modal-open");
      }
    };
  }, [locked]);
}
