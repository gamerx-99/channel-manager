import { useRef } from "react";
import { BUILDER_TABS, nextTabIndex, type BuilderTab } from "@/components/website-builder/websiteBuilderRules";

interface BuilderTabsProps {
  label: string;
  labels: Record<BuilderTab, string>;
  active: BuilderTab;
  onChange: (tab: BuilderTab) => void;
}

export const tabId = (tab: BuilderTab) => `wb-tab-${tab}`;
export const panelId = (tab: BuilderTab) => `wb-panel-${tab}`;

/** Free-order tabs: any tab can be opened first; arrow keys, Home and End move between them. */
export function BuilderTabs({ label, labels, active, onChange }: BuilderTabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div className="wb-tabs" role="tablist" aria-label={label}>
      {BUILDER_TABS.map((tab, index) => (
        <button
          key={tab}
          ref={node => { refs.current[tab] = node; }}
          id={tabId(tab)}
          type="button"
          role="tab"
          aria-selected={active === tab}
          aria-controls={panelId(tab)}
          tabIndex={active === tab ? 0 : -1}
          className="wb-tab"
          onClick={() => onChange(tab)}
          onKeyDown={event => {
            const next = nextTabIndex(event.key, index, BUILDER_TABS.length);
            if (next === null) return;
            event.preventDefault();
            const target = BUILDER_TABS[next];
            onChange(target);
            refs.current[target]?.focus();
          }}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}
