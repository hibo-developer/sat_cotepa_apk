/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#edf0fa',
          100: '#d6ddf4',
          200: '#bcc8ee',
          500: '#334a9b',
          600: '#22347f',
          700: '#1d2c6c',
          800: '#172456',
          900: '#141f4b',
        },
        'cotepa-rojo': {
          50: '#fff2f4',
          100: '#ffd8df',
          500: '#e3002d',
          600: '#bf0026',
          700: '#98001e',
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
          'surface-elevated': '#ffffff',
          primary: '#22347f',
          danger: '#e3002d',
          success: '#0f8a5f',
          warning: '#b7791f',
        },
      },
      boxShadow: {
        tarjeta: '0 10px 25px -10px rgba(17, 30, 76, 0.28)',
        suave: '0 14px 38px -22px rgba(15, 23, 42, 0.28)',
        hero: '0 24px 60px -28px rgba(20, 31, 75, 0.45)',
        lift: '0 18px 48px -28px rgba(34, 52, 127, 0.32)',
      },
    },
  },
  plugins: [],
};
