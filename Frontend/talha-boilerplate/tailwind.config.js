// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        'purple-dark': {
          'primary': '#8B5CF6',        // Purple
          'primary-focus': '#7C3AED',   // Darker purple
          'primary-content': '#FFFFFF',  // White text on primary

          'secondary': '#A78BFA',       // Light purple
          'secondary-focus': '#8B5CF6',
          'secondary-content': '#FFFFFF',

          'accent': '#6D28D9',          // Deep purple
          'accent-focus': '#5B21B6',
          'accent-content': '#FFFFFF',

          'neutral': '#1E1B4B',         // Dark purple bg
          'neutral-focus': '#15132B',
          'neutral-content': '#FFFFFF',

          'base-100': '#2D2A5E',        // Main background (purple)
          'base-200': '#1E1B4B',        // Darker bg
          'base-300': '#15132B',        // Darkest bg
          'base-content': '#FFFFFF',    // White text

          'info': '#8B5CF6',
          'success': '#34D399',
          'warning': '#FBBF24',
          'error': '#F87171',

          '--rounded-box': '0.75rem',
          '--rounded-btn': '0.5rem',
          '--rounded-badge': '1rem',

          '--animation-btn': '0.15s',
          '--animation-input': '0.15s',

          '--btn-text-case': 'none',
          '--navbar-padding': '0.5rem',
          '--border-btn': '1px',
        },
      },
      'dark', // Keep dark as fallback
    ],
  },
}