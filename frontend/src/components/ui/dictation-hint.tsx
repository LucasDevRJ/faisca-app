import { useAccessibility } from '../../features/profile/use-profile';

// "Prefere falar?" (#154): o microfone do teclado do celular já transforma fala em texto, sem o
// Faísca guardar áudio nenhum. Só aparece em tela de toque, onde existe esse teclado.
export function DictationHint() {
  const { directLanguage } = useAccessibility();
  return (
    <p className="hidden text-sm text-muted pointer-coarse:block">
      {directLanguage
        ? 'Para ditar em vez de digitar, use o microfone do teclado do celular.'
        : 'Prefere falar? Use o microfone do teclado do celular.'}
    </p>
  );
}
