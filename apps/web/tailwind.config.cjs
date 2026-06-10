/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#fff8f4",
        ink: "#201b15",
        "ink-soft": "#362f29",
        muted: "#57423b",
        "muted-2": "#8a726a",
        line: "#dec0b7",
        surface: "#ffffff",
        "surface-soft": "#f8ece2",
        accent: "#9e3d16",
        "accent-strong": "#812801",
        "accent-soft": "#ffdbcf",
        teal: "#7d562d",
        "teal-soft": "#ffdcbd",
        violet: "#51406f",
        "violet-soft": "#e8e1f0",
        danger: "#ba1a1a"
      },
      boxShadow: {
        soft: "0 8px 20px rgba(54, 47, 41, 0.06)",
        panel: "0 16px 40px rgba(54, 47, 41, 0.08)"
      },
      fontFamily: {
        sans: [
          "Inter",
          "Geist",
          "SF Pro Text",
          "SF Pro Display",
          "Alibaba PuHuiTi",
          "Alibaba PuHuiTi 2.0",
          "HarmonyOS Sans SC",
          "Source Han Sans SC",
          "Noto Sans SC",
          "PingFang SC",
          "Microsoft YaHei UI",
          "Microsoft YaHei",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};
