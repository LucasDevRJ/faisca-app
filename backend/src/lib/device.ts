// "Chrome no Android", para o aviso de login novo (DEC-091): só o navegador e o sistema, para a
// pessoa reconhecer o acesso. Lê o cabeçalho User-Agent na hora, sem guardar nem logar nada, e
// sem IP nem localização. Desconhecido vira null, e o e-mail omite a frase.

const BROWSERS: [RegExp, string][] = [
  // A ordem importa: Edge, Opera e Samsung Internet também dizem "Chrome"; o Chrome diz "Safari".
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  // iPhone e iPad antes de Mac: o iPad às vezes se apresenta como Macintosh, mas com "Mobile".
  [/iPhone/, 'iPhone'],
  [/iPad|Macintosh.*Mobile\//, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Linux/, 'Linux'],
];

function first(userAgent: string, list: [RegExp, string][]): string | null {
  return list.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

export function describeDevice(userAgent: string | undefined): string | null {
  // Cabeçalho gigante não é de navegador de verdade: nem tenta.
  if (!userAgent || userAgent.length > 1000) return null;
  const browser = first(userAgent, BROWSERS);
  const system = first(userAgent, SYSTEMS);
  if (browser && system) return `${browser} no ${system}`;
  return browser ?? system;
}
