import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Mic } from "lucide-react";

type OverlayState = "idle" | "listening" | "processing" | "no-match" | "matched";

export default function Overlay() {
  const [state, setState] = useState<OverlayState>("idle");
  const [matchInfo, setMatchInfo] = useState("");
  const dismissTimerRef = useRef<number | null>(null);

  // Clear any pending dismiss timer
  const clearDismissTimer = () => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  useEffect(() => {
    const unsubs = [
      listen<string>("recording-state", (event) => {
        const s = event.payload;
        if (s === "idle" || s === "listening" || s === "processing") {
          // Clear any pending auto-dismiss when entering a new recording state
          clearDismissTimer();
          setState(s as OverlayState);
        }
      }),
      listen<{ text: string }>("no-match", (event) => {
        const heard = event.payload.text || "nothing";
        setMatchInfo(heard);
        setState("no-match");
        // Clear old timer before setting new one
        clearDismissTimer();
        dismissTimerRef.current = window.setTimeout(() => {
          setState("idle");
          dismissTimerRef.current = null;
        }, 2000);
      }),
      listen<{ trigger: string; expansion: string }>("match-found", (event) => {
        setMatchInfo(`"${event.payload.trigger}" → inserted`);
        setState("matched");
        // Clear old timer before setting new one
        clearDismissTimer();
        dismissTimerRef.current = window.setTimeout(() => {
          setState("idle");
          dismissTimerRef.current = null;
        }, 1500);
      }),
    ];

    return () => {
      // Clean up timers when component unmounts
      clearDismissTimer();
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  if (state === "idle" || state === "matched") return null;

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="px-6 py-3.5 rounded-2xl shadow-xl backdrop-blur-lg bg-card/95 border border-border/50 flex items-center gap-3 min-w-50 overflow-hidden">
        {state === "listening" && (
          <>
            <Mic className="h-4 w-4 text-primary animate-pulse shrink-0" />
            <span className="text-sm font-medium text-foreground">Listening…</span>
          </>
        )}
        {state === "processing" && (
          <>
            <svg
              className="animate-spin h-4 w-4 text-primary shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm font-medium text-foreground">Processing…</span>
          </>
        )}
        {state === "no-match" && (
          <>
            <svg
              className="h-4 w-4 text-muted-foreground shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span className="text-sm text-muted-foreground truncate">
              No match for <span className="font-mono ">"{matchInfo}"</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
