import { useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import { useGuidedTour, type TourStep } from "./useGuidedTour";
import "./guidedTour.css";

export function GuidedTour({ steps, active, onFinish, onRestart }: { steps: TourStep[]; active: boolean; onFinish: (skipped: boolean) => void; onRestart: () => void }) {
  const { t } = useTranslation();
  const { step, stepIndex, rect, next, skip } = useGuidedTour(steps, active, onFinish);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active || step?.target !== "hotel-settings") return;
    const target = document.querySelector<HTMLElement>('[data-tour="hotel-settings"]');
    if (target && !document.querySelector('[data-tour="hotel-settings-fields"]')) target.click();
    // Once per entry into the step: the owner may close the editor and must not see it reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, step?.target]);
  // Leaving the hotel step: close the hotel editor so the rooms panel is visible and clickable.
  useEffect(() => {
    if (active && step && step.target !== "hotel-settings") window.dispatchEvent(new Event("guided-tour:close-hotel-editor"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, step?.target]);
  // Bring each step's target into view; the tooltip then follows it via the scroll listener.
  useEffect(() => {
    if (!active || !step?.target || step.target === "hotel-settings") return;
    // The hotel editor closed just before; its page scroll lock (body[data-scroll-locked]) is
    // released only after its closing animation. Wait for that, up to 3 s, then jump instantly:
    // the tooltip follows the target, so no smooth motion is needed.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (document.body.hasAttribute("data-scroll-locked") && tries < 60) return;
      window.clearInterval(timer);
      document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- steps are rebuilt each render; key on the step itself.
  }, [active, stepIndex, step?.target]);
  useEffect(() => { if (active) panel.current?.focus({ preventScroll: true }); }, [active, stepIndex]);
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, skip]);
  if (!active || !step) return <button type="button" className="guided-tour-restart" onClick={onRestart}>{t("guidedTour.restart")}</button>;
  const missing = Boolean(step.target && !rect);
  const style = rect && !missing ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined;
  const cardTop = rect && rect.bottom + 300 > window.innerHeight ? Math.max(16, rect.top - 300) : rect ? rect.bottom + 12 : 0;
  const cardStyle = rect && !missing ? { top: cardTop, left: Math.max(16, Math.min(rect.left, window.innerWidth - 386)), transform: "none" } : undefined;
  return <div className={`guided-tour${!rect || missing ? " guided-tour-centered" : ""}`} role="presentation">
    <div className="guided-tour-target" style={style} aria-hidden="true" />
    <section className={`guided-tour-card${missing || !step.target ? " centered" : ""}`} style={cardStyle} ref={panel} tabIndex={-1} aria-live="polite" aria-label={step.title}>
      {/* The last card is the summary; its title says whether setup is really done. */}
      {stepIndex < steps.length - 1 && <p className="guided-tour-count">{t("guidedTour.step", { current: stepIndex + 1, total: steps.length - 1 })}</p>}
      <h2>{step.title}</h2><p>{step.body}</p>
      {step.action && <p className="guided-tour-action">{step.action}</p>}
      <div className="guided-tour-buttons">{stepIndex < steps.length - 1 && <button type="button" className="button button-quiet" onClick={skip}>{t("guidedTour.skip")}</button>}<button type="button" className="button button-primary" onClick={next}>{stepIndex === steps.length - 1 ? t("guidedTour.startUsing") : t("guidedTour.next")}</button></div>
    </section>
  </div>;
}
