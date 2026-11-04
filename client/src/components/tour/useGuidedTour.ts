import { useCallback, useEffect, useState } from "react";

export type TourStep = { target?: string; title: string; body: string; action?: string };
export function useGuidedTour(steps: TourStep[], active: boolean, onFinish: (skipped: boolean) => void) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIndex];
  useEffect(() => { if (active) setStepIndex(0); }, [active]);
  const recalculate = useCallback(() => {
    if (!active || !step?.target) { setRect(null); return; }
    const target = step.target === "hotel-settings" && document.querySelector('[data-tour="hotel-settings-fields"]')
      ? document.querySelector<HTMLElement>('[data-tour="hotel-settings-fields"]')
      : document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    setRect(target ? target.getBoundingClientRect() : null);
    // Steps are rebuilt on every render; depend on the target name, not the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step?.target]);
  useEffect(() => {
    recalculate();
    window.addEventListener("resize", recalculate);
    window.addEventListener("scroll", recalculate, true);
    const observer = new MutationObserver(recalculate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); window.removeEventListener("resize", recalculate); window.removeEventListener("scroll", recalculate, true); };
  }, [recalculate]);
  const next = useCallback(() => { if (stepIndex + 1 >= steps.length) onFinish(false); else setStepIndex(i => i + 1); }, [onFinish, stepIndex, steps.length]);
  const skip = useCallback(() => onFinish(true), [onFinish]);
  return { step, stepIndex, rect, next, skip, setStepIndex };
}
