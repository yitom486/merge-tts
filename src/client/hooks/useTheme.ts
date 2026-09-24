import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = localStorage.getItem('gemini-studio-theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const applyTheme = useCallback((newTheme: Theme) => {
    const root = document.documentElement;

    const performDomUpdate = () => {
      if (newTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    // 1. 添加全局统一过渡动画锁定类
    root.classList.add('theme-transitioning');

    // 2. 如果浏览器支持 View Transitions API，提供原生的无缝渐变
    if ('startViewTransition' in document && typeof (document as any).startViewTransition === 'function') {
      (document as any).startViewTransition(() => {
        performDomUpdate();
      });
    } else {
      performDomUpdate();
    }

    // 3. 320ms 后解除全局动画锁定，确保平常操作不会受强制 transition 干扰
    const timer = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 320);

    localStorage.setItem('gemini-studio-theme', newTheme);
    setTheme(newTheme);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // 页面初始化时挂载主题
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, applyTheme]);

  return { theme, toggleTheme, setTheme: applyTheme };
}
