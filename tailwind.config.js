/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        sidebar: {
          DEFAULT: "var(--sidebar-bg)",
          foreground: "var(--sidebar-foreground)",
          border: "var(--sidebar-border)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
          border: "var(--card-border)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          foreground: "var(--card-foreground)",
          muted: "var(--surface-muted)",
          elevated: "var(--surface-elevated)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          hover: "var(--primary-hover)",
          muted: "var(--primary-muted)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        input: "var(--input)",
        ring: "var(--ring)",
        status: {
          backlog: "var(--status-backlog)",
          todo: "var(--status-todo)",
          progress: "var(--status-progress)",
          review: "var(--status-review)",
          done: "var(--status-done)",
          blocked: "var(--status-blocked)",
          cancelled: "var(--status-cancelled)",
        },
        priority: {
          low: "var(--priority-low)",
          medium: "var(--priority-medium)",
          high: "var(--priority-high)",
          urgent: "var(--priority-urgent)",
        },
      },
      borderRadius: {
        xs: "var(--radius-xs, 2px)",
        sm: "var(--radius-sm, 4px)",
        md: "var(--radius-md, 6px)",
        lg: "var(--radius-lg, 8px)",
        xl: "var(--radius-xl, 12px)",
        full: "9999px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
