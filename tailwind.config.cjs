/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      // Explicit mobile-first breakpoints (Tailwind defaults)
      screens: {
        'sm': '640px',  // mobile landscape & small tablets
        'md': '768px',  // tablets
        'lg': '1024px', // desktop
        'xl': '1280px', // large desktop
        '2xl': '1440px' // extra large desktop
      },
      // Touch-friendly sizing utilities
      minHeight: {
        'touch': '44px',
        'touch-lg': '48px',
      },
      minWidth: {
        'touch': '44px',
        'touch-lg': '48px',
      },
      spacing: {
        'touch': '44px',
        'touch-lg': '48px',
      }
    }
  },
  plugins: []
};
