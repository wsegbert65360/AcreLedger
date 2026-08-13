import { createContext, useContext, useEffect, useState } from "react";

import { native } from "@/lib/native";

export const THEMES = ["light", "dark", "color", "system"] as const;
export type Theme = (typeof THEMES)[number];
type ResolvedTheme = Exclude<Theme, "system">;

const THEME_CLASSES: ResolvedTheme[] = ["light", "dark", "color"];

// Background tokens from index.css, converted for the theme-color meta tag.
const THEME_COLOR_HEX: Record<ResolvedTheme, string> = {
    light: "#dfe7f1", // hsl(212 40% 91%)
    dark: "#000000",
    color: "#faf8ef", // hsl(48 55% 96%)
};

function isTheme(value: string | null): value is Theme {
    return THEMES.includes(value as Theme);
}

interface ThemeProviderState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "ff-ui-theme",
    ...props
}: {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}) {
    const [theme, setTheme] = useState<Theme>(
        () => {
            const stored = localStorage.getItem(storageKey);
            return isTheme(stored) ? stored : defaultTheme;
        }
    );

    useEffect(() => {
        const root = window.document.documentElement;

        const applyResolvedTheme = (resolved: ResolvedTheme) => {
            root.classList.remove(...THEME_CLASSES);
            root.classList.add(resolved);

            const metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) {
                metaThemeColor.setAttribute("content", THEME_COLOR_HEX[resolved]);
            }

            if (resolved === "dark") {
                native.statusBar.setLight();
            } else {
                native.statusBar.setDark();
            }
        };

        if (theme === "system") {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

            const applySystemTheme = (e: MediaQueryListEvent | MediaQueryList) => {
                applyResolvedTheme(e.matches ? "dark" : "light");
            };

            applySystemTheme(mediaQuery);

            mediaQuery.addEventListener("change", applySystemTheme);

            return () => {
                mediaQuery.removeEventListener("change", applySystemTheme);
            };
        }

        applyResolvedTheme(theme);
    }, [theme]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            localStorage.setItem(storageKey, theme);
            setTheme(theme);
        },
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider");

    return context;
}
