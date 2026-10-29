import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Small light/dark toggle used in the admin panel. Reads & writes the
 * shared ThemeContext, which in turn flips the `dark` class on <html>.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-200
                  dark:hover:text-stone-300 dark:hover:bg-stone-800 transition-colors cursor-pointer ${className}`}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
