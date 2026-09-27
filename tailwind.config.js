/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/launcher/**/*.{tsx,ts,html}', './src/settings/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        glass: 'var(--glass-bg)',
      },
      borderRadius: {
        panel: 'var(--radius-panel)',
        row: 'var(--radius-row)',
      },
      transitionTimingFunction: {
        spring: 'var(--ease-spring)',
      },
    },
  },
  plugins: [],
};
