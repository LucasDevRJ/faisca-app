import type { ButtonHTMLAttributes, Ref } from 'react';
import { buttonClasses, type ButtonVariant } from './button-styles';

// No React 19, `ref` chega como prop comum (para devolver o foco a um botão).
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; ref?: Ref<HTMLButtonElement> };

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
