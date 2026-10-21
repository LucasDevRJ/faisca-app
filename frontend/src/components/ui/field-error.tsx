// Mensagem de erro de um campo, com ícone: o erro não depende só da cor (WCAG 1.4.1).
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-accent-text">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM10 5a.9.9 0 0 1 .9.9v4.4a.9.9 0 0 1-1.8 0V5.9A.9.9 0 0 1 10 5Zm0 9.6a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"
          clipRule="evenodd"
        />
      </svg>
      <span>{children}</span>
    </p>
  );
}
