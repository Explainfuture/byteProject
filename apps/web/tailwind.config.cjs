/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f4efe6",
        ink: "#241f1c",
        "ink-soft": "#4c423b",
        muted: "#766b62",
        "muted-2": "#9a8d82",
        line: "#dfd2c3",
        surface: "#fffdf9",
        "surface-soft": "#fbf5ed",
        accent: "#8b4e32",
        "accent-strong": "#6f3426",
        "accent-soft": "#f3d9c4",
        teal: "#276861",
        "teal-soft": "#d9ece7",
        violet: "#51406f",
        "violet-soft": "#e8e1f0",
        danger: "#a33b31"
      },
      boxShadow: {
        soft: "0 18px 48px rgba(58, 45, 35, 0.10)",
        panel: "0 24px 70px rgba(58, 45, 35, 0.14)"
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Microsoft YaHei UI",
          "Microsoft YaHei",
          "Noto Sans SC",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};
