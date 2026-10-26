import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          // The app theme (index.css) has no shadcn --popover/--border tokens; without
          // these fallbacks the toast background resolved to transparent.
          "--normal-bg": "var(--popover, var(--white))",
          "--normal-text": "var(--popover-foreground, var(--ink))",
          "--normal-border": "var(--border, var(--rule-strong))",
        } as React.CSSProperties
      }
      toastOptions={{ style: { boxShadow: "0 12px 32px rgba(60, 45, 40, .18)" } }}
      {...props}
    />
  );
};

export { Toaster };
