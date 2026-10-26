import { useState } from 'react';

// Foto de perfil (DEC-061, DEC-069): círculo com anel na cor principal da paleta. Sem foto (ou se
// ela não carregar), as iniciais do nome no mesmo círculo.

const SIZE = {
  sm: 'size-12 text-base',
  md: 'size-16 text-xl',
  lg: 'size-24 text-3xl',
} as const;

// "Ana Fictícia da Silva" → "AS"; "Ana" → "A". Só letras: "Ana (fictícia)" → "AF", sem o parêntese.
function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.match(/\p{L}/u)?.[0])
    .filter((letter): letter is string => Boolean(letter));
  if (letters.length === 0) return '?';
  const initials = letters.length > 1 ? letters[0]! + letters[letters.length - 1]! : letters[0]!;
  return initials.toLocaleUpperCase('pt-BR');
}

type AvatarProps = {
  name: string;
  // Endereço da foto, ou null sem foto.
  src: string | null;
  size?: keyof typeof SIZE;
};

// Decorativa: o nome da pessoa sempre aparece em texto ao lado, então a foto não tem texto
// alternativo próprio e as iniciais ficam escondidas do leitor de tela.
export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = src !== null && failed !== src;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-score-0 font-heading font-bold text-primary-text shadow-soft ring-[3px] ring-primary ${SIZE[size]}`}
    >
      {showPhoto ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(src)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
