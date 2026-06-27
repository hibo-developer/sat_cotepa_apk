/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#edf0fa',
          100: '#d6ddf4',
          600: '#22347f',
          700: '#1d2c6c',
          900: '#141f4b',
        },
        'cotepa-rojo': {
          100: '#ffd8df',
          500: '#e3002d',
          600: '#bf0026',
        },
        sat: {
          bg: '#eff4fc',
          text: '#0f172a',
          muted: '#334155',
          subtle: '#64748b',
          faint: '#94a3b8',
          border: '#cbd5e1',
          'border-soft': '#e2e8f0',
          surface: '#f8fafc',
          'surface-alt': '#f1f5f9',
          primary: '#22347f',
          danger: '#e3002d',
        },
      },
      boxShadow: {
        tarjeta: '0 10px 25px -10px rgba(17, 30, 76, 0.28)',
      },
    },
  },
  plugins: [],
};
