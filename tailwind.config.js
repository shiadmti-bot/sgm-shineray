/** @type {import('tailwindcss').Config} */
const { fontFamily } = require("tailwindcss/defaultTheme");

// Cores definidas como variáveis HSL em src/app/globals.css (tema claro e escuro).
const cor = (nome) => `hsl(var(--${nome}) / <alpha-value>)`;

module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
        mono: ["var(--font-geist-mono)", ...fontFamily.mono],
      },
      colors: {
        border: cor("border"),
        input: cor("input"),
        ring: cor("ring"),
        background: cor("background"),
        foreground: cor("foreground"),
        primary: { DEFAULT: cor("primary"), foreground: cor("primary-foreground") },
        secondary: { DEFAULT: cor("secondary"), foreground: cor("secondary-foreground") },
        destructive: { DEFAULT: cor("destructive"), foreground: cor("destructive-foreground") },
        success: { DEFAULT: cor("success"), foreground: cor("success-foreground") },
        warning: { DEFAULT: cor("warning"), foreground: cor("warning-foreground") },
        info: { DEFAULT: cor("info"), foreground: cor("info-foreground") },
        muted: { DEFAULT: cor("muted"), foreground: cor("muted-foreground") },
        accent: { DEFAULT: cor("accent"), foreground: cor("accent-foreground") },
        popover: { DEFAULT: cor("popover"), foreground: cor("popover-foreground") },
        card: { DEFAULT: cor("card"), foreground: cor("card-foreground") },
        sidebar: {
          DEFAULT: cor("sidebar"),
          foreground: cor("sidebar-foreground"),
          border: cor("sidebar-border"),
          accent: cor("sidebar-accent"),
          "accent-foreground": cor("sidebar-accent-foreground"),
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
