import { useContext } from 'react';
import { ThemeContext, type ThemeContextType } from '../context/ThemeContextCore';

export function useThemeMode(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useThemeMode must be used within ThemeProvider');
    }
    return context;
}
