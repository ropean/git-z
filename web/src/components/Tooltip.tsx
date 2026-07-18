import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Custom replacement for the native `title` attribute tooltip, which on most
// browsers/OSes only appears after a long (~1s+) hover delay and can't be
// themed. Any element with a `data-tip="..."` attribute gets a fast, themed
// tooltip via this single delegated listener — mount <TooltipHost /> once
// near the app root.
const SHOW_DELAY_MS = 60;
const MARGIN = 8;

type Placement = { top: number; left: number; flipY: boolean };

export function TooltipHost() {
  const [text, setText] = useState<string | null>(null);
  const [pos, setPos] = useState<Placement>({ top: 0, left: 0, flipY: false });
  const targetRef = useRef<Element | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Flips above/below the trigger depending on which side has room, and
  // shifts left/right so the bubble never runs past the viewport edge —
  // both re-derived from the trigger's live position on every placement,
  // so resizing the window or scrolling a different area still lands
  // correctly next time a tooltip opens.
  const computePlacement = (el: Element): Placement => {
    const rect = el.getBoundingClientRect();
    const bubble = bubbleRef.current;
    const bubbleWidth = bubble?.offsetWidth ?? 0;
    const bubbleHeight = bubble?.offsetHeight ?? 32;
    const flipY = rect.top - bubbleHeight - MARGIN < 0;

    const half = bubbleWidth / 2;
    const minCenter = MARGIN + half;
    const maxCenter = window.innerWidth - MARGIN - half;
    const idealCenter = rect.left + rect.width / 2;
    const left =
      maxCenter < minCenter ? window.innerWidth / 2 : Math.min(Math.max(idealCenter, minCenter), maxCenter);

    return { top: flipY ? rect.bottom + MARGIN : rect.top - MARGIN, left, flipY };
  };

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };

    const hide = () => {
      clearTimer();
      targetRef.current = null;
      setText(null);
    };

    const onOver = (e: Event) => {
      const el = (e.target as Element)?.closest?.("[data-tip]");
      if (!el || el === targetRef.current) return;
      const tip = el.getAttribute("data-tip");
      if (!tip) return;
      clearTimer();
      targetRef.current = el;
      timerRef.current = window.setTimeout(() => {
        if (targetRef.current !== el) return;
        setPos(computePlacement(el));
        setText(tip);
      }, SHOW_DELAY_MS);
    };

    const onOut = (e: Event) => {
      const el = (e.target as Element)?.closest?.("[data-tip]");
      if (!el || el !== targetRef.current) return;
      const related = (e as MouseEvent).relatedTarget as Node | null;
      if (related && el.contains(related)) return;
      hide();
    };

    const onScroll = () => hide();

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", onOut);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", hide);
      clearTimer();
    };
  }, []);

  // Re-measure synchronously (before paint) once the bubble has real
  // content and a real size, so the flip/shift decision above is exact
  // instead of based on the SHOW_DELAY_MS-old placement's fallback size.
  useLayoutEffect(() => {
    if (text != null && targetRef.current) {
      setPos(computePlacement(targetRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return createPortal(
    <div
      ref={bubbleRef}
      className="tooltip-bubble"
      style={{
        top: pos.top,
        left: pos.left,
        transform: `translate(-50%, ${pos.flipY ? "0" : "-100%"})`,
        opacity: text ? 1 : 0,
        visibility: text ? "visible" : "hidden",
      }}
    >
      {text}
    </div>,
    document.body,
  );
}
