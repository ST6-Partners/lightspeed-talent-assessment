/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ls: {
          cyan: '#4FA9D6',
          'cyan-bright': '#6FBCE0',
          primary: '#2E89B8',
          'primary-600': '#246F97',
          'primary-50': '#EAF4FA',
          ink: '#2E3942',
          'ink-2': '#51606A',
          'ink-3': '#8A969E',
          line: '#E3E8EB',
          surface: '#FFFFFF',
          bg: '#F6F9FA',
          'bg-2': '#EEF3F5',
          slate: '#28323A',
          'slate-2': '#323D46',
          thrive: '#2E9E7B',
          'thrive-bg': '#E6F4EF',
          watch: '#C99300',
          'watch-bg': '#FBF2DC',
          risk: '#C2615A',
          'risk-bg': '#F8EAE8',
        },
      },
    },
  },
  plugins: [],
};
