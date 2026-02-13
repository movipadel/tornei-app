/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // layout / spacing
    "min-h-screen",
    "max-w-6xl",
    "mx-auto",
    "px-4",
    "py-8",
    "mb-8",
    "space-y-4",
    "space-y-6",
    "gap-2",
    "gap-3",
    "gap-4",

    // typography
    "text-slate-900",
    "text-slate-800",
    "text-slate-700",
    "text-slate-600",
    "text-slate-500",
    "text-sm",
    "text-xs",
    "text-lg",
    "text-2xl",
    "text-3xl",
    "font-semibold",
    "font-bold",

    // backgrounds / gradients
    "bg-white",
    "bg-slate-50",
    "bg-slate-100",
    "bg-indigo-50",
    "bg-amber-50",
    "bg-gradient-to-br",
    "from-slate-50",
    "to-indigo-50",

    // borders / radius / shadows
    "border",
    "border-slate-200",
    "border-slate-100",
    "border-amber-200",
    "rounded-xl",
    "shadow-sm",
    "hover:shadow-md",
    "transition-shadow",

    // flex
    "flex",
    "flex-1",
    "flex-col",
    "flex-row",
    "flex-wrap",
    "items-center",
    "items-start",
    "justify-between",

    // misc
    "overflow-hidden",
    "whitespace-nowrap",
    "transition-transform",
    "rotate-180",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
