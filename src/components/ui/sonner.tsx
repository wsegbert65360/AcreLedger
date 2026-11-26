import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Phones: sit above the bottom tab bar and the home indicator, not on them.
      mobileOffset={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          // Undo and similar actions: 36px instead of Sonner's 24px, with a larger touch area.
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground !h-9 !px-3",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground !h-9 !px-3",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
