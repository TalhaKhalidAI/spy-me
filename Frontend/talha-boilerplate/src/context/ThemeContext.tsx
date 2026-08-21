import { useState, useEffect, type ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline, GlobalStyles } from '@mui/material';
import { ThemeContext, type ThemeMode } from './ThemeContextCore';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme-mode');
      return (saved as ThemeMode) || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme-mode', mode);
    // Apply mode to document body
    document.body.style.backgroundColor = mode === 'dark' ? '#111827' : '#f9fafb';
    document.body.style.color = mode === 'dark' ? '#f9fafb' : '#111827';
  }, [mode]);

  const toggleTheme = () => {
    setMode((prev: ThemeMode) => (prev === 'light' ? 'dark' : 'light'));
  };

  const theme = createTheme({
    palette: {
      mode,
      ...(mode === 'light'
        ? {
          primary: { main: '#4f46e5' },
          secondary: { main: '#10b981' },
          background: { default: '#f9fafb', paper: '#ffffff' },
          text: { primary: '#111827', secondary: '#6b7280' },
        }
        : {
          primary: { main: '#818cf8' },
          secondary: { main: '#34d399' },
          background: { default: '#111827', paper: '#1f2937' },
          text: { primary: '#f9fafb', secondary: '#9ca3af' },
        }),
    },
  });

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme, setMode }}>
      <MuiThemeProvider theme={theme}>
        <GlobalStyles
          styles={{
            body: {
              backgroundColor: mode === 'dark' ? '#111827' : '#f9fafb',
              color: mode === 'dark' ? '#f9fafb' : '#111827',
            },
            '*::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '*::-webkit-scrollbar-track': {
              background: mode === 'dark' ? '#1f2937' : '#f1f1f1',
            },
            '*::-webkit-scrollbar-thumb': {
              background: mode === 'dark' ? '#4b5563' : '#c1c1c1',
              borderRadius: '4px',
            },
          }}
        />
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}


export type { ThemeMode };
