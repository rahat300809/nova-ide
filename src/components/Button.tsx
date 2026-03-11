import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Button = ({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/20 border border-blue-500/50',
    secondary: 'glass-panel text-slate-700 hover:bg-white/90',
    ghost: 'text-slate-600 hover:bg-slate-200/50',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20',
  };
  return (
    <button 
      className={cn('px-4 py-2 rounded-xl font-medium transition-all duration-200 active:scale-95 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed', variants[variant], className)} 
      {...props} 
    />
  );
};

export const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn('w-full px-4 py-3 rounded-xl bg-white/70 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400/50 transition-all backdrop-blur-sm', className)} 
    {...props} 
  />
);

export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("glass-card p-6", className)}>
    {children}
  </div>
);
