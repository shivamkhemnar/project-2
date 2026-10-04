/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        industrial: { 950: "#0a0e14", 900: "#10151d", 800: "#161d27", 700: "#1f2833" },
        safety: { green: "#10b981", amber: "#f59e0b", red: "#ef4444", cyan: "#22d3ee" }
      },
      fontFamily: { mono: ["JetBrains Mono", "ui-monospace", "monospace"] }
    }
  },
  plugins: []
};
