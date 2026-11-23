import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { ThemeSwitcher } from '../components/theme-switcher';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

const sections = [
  ['conta', 'Criar sua conta'],
  ['vinculo', 'Vínculo e privacidade'],
  ['atividades', 'Atividades'],
  ['pensamentos', 'Pensamentos'],
  ['tensao', 'Tensão'],
  ['acao', 'Ação'],
  ['agenda', 'Consultas e ciclo'],
  ['planos', 'Meus Planos'],
  ['tarefas', 'Tarefas'],
  ['sono-humor', 'Sono e humor'],
  ['medicamentos', 'Remédios e o que sinto'],
  ['sobre-mim', 'Sobre mim'],
  ['avisos', 'Avisos'],
  ['buscar-ligar', 'Buscar e ligar registros'],
  ['mensagens', 'Mensagens privadas'],
  ['profissionais', 'Para psicólogas e psiquiatras'],
  ['comunidade', 'Comunidade'],
  ['instalar', 'Instalar no celular'],
  ['seguranca', 'Segurança e privacidade'],
  ['ditado', 'Ditar em vez de digitar'],
  ['perguntas', 'Perguntas frequentes'],
  ['sobre', 'Quem está por trás'],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-xl border border-border bg-surface p-5 shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-7">
      <h2 id={`${id}-title`} tabIndex={-1} className="text-2xl font-semibold outline-none">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4 leading-relaxed text-text">{children}</div>
    </section>
  );
}

function RecordGuide({ id, title, children, clinical = false }: { id: string; title: string; children: ReactNode; clinical?: boolean }) {
  return (
    <article id={id} tabIndex={-1} className="scroll-mt-6 border-t border-border pt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary first:border-0 first:pt-0">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-2 flex flex-col gap-2 text-muted">
        {children}
        {clinical && <p className="border-t border-border pt-2 text-sm">Na dúvida, converse com a sua psicóloga.</p>}
      </div>
    </article>
  );
}

function HelpFigure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-background">
      <img src={src} alt={alt} loading="lazy" className="mx-auto max-h-[34rem] w-full object-contain" />
      <figcaption className="border-t border-border px-3 py-2 text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}

// Página pública e didática (#140). Explica para que servem as áreas, sem ensinar técnica clínica.
// Confira esta página em toda mudança que altere o funcionamento descrito; ver finalizar-mudanca.
export function HowItWorksPage() {
  const { hash } = useLocation();

  // Links diretos da página pública também deixam o foco na seção para teclado e leitor de tela.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }, [hash]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/entrar" aria-label="Faísca, ir para entrar" className="flex items-center gap-3 rounded-md">
          <img src="/icon.svg" alt="" className="size-10" />
          <span className="font-heading text-2xl font-bold">Faísca</span>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeSwitcher />
          <Link to="/entrar" className={`${linkClass} inline-flex min-h-11 items-center`}>Entrar</Link>
          <Link to="/cadastro" className={`${linkClass} inline-flex min-h-11 items-center`}>Criar conta</Link>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-text">Um guia para começar</p>
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Como funciona o Faísca</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          Um espaço para guardar o que acontece entre consultas e levar esses registros para a conversa com a sua
          profissional. Você decide o que compartilhar.
        </p>
      </div>

      <section aria-labelledby="contents-title" className="rounded-xl border border-border bg-surface p-5 shadow-soft sm:p-7">
        <h2 id="contents-title" className="text-xl font-semibold">Neste guia</h2>
        <nav aria-label="Seções deste guia" className="mt-3 grid gap-2 sm:grid-cols-2">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={`${linkClass} min-h-11 py-2`}>
              {label}
            </a>
          ))}
        </nav>
      </section>

      <Section id="conta" title="Criar sua conta">
        <p>
          O cadastro é gratuito. Escolha se vai usar o perfil de paciente, de profissional (psicóloga ou psiquiatra) ou
          os dois. Depois, confirme seu e-mail pelo link enviado pelo Faísca; esse link vale por 24 horas.
        </p>
        <p>
          Como o Faísca registra informações pessoais e de saúde, o cadastro pede que você leia e aceite o aviso de
          privacidade. Você pode consultá-lo a qualquer momento.
        </p>
        <p>
          Em <strong>Conta → Personalização → Personalizar início</strong>, quem usa o perfil de paciente pode fixar até três atalhos
          em Meus registros. Em <strong>Cartões do início</strong>, pode escolher quais cartões aparecem e em
          que ordem, além de começar com o gráfico recolhido. Essas escolhas ficam salvas neste navegador.
        </p>
        <p>Em <strong>Cor de destaque</strong>, experimente uma cor para botões e links ou restaure a cor da paleta.</p>
      </Section>

      <Section id="vinculo" title="Vínculo e privacidade">
        <p>
          O vínculo permite que uma profissional acompanhe os registros que você escolher liberar. Você pode ter uma
          psicóloga e uma psiquiatra; cada vínculo e cada conjunto de permissões são independentes.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Em <strong>Conta</strong>, toque em <strong>Gerar código</strong> ou em <strong>Convidar por e-mail</strong>.</li>
          <li>Se gerar um código, passe-o à profissional. Ele tem 8 caracteres, vale por 24 horas e pode ser usado uma vez.</li>
          <li>A profissional digita o código em <strong>Meus pacientes</strong>. Com o convite por e-mail, ela abre o link recebido.</li>
          <li>Em Conta, escolha quais áreas cada profissional pode ver e salve. Uma profissional nova começa sem acesso aos registros.</li>
        </ol>
        <p>
          A profissional só lê as áreas liberadas enquanto o vínculo estiver ativo. Ela não edita seus registros. Você
          pode mudar as permissões ou tocar em <strong>Desfazer vínculo</strong>; a mudança vale na hora e seus registros
          permanecem na sua conta.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <HelpFigure
            src="/como-funciona/vinculo-paciente-2026-11-22.png"
            alt="Captura da área Quem me acompanha em Conta, com as opções Gerar código e Convidar por e-mail."
            caption="Conta · Quem me acompanha — captura feita em 22/11/2026. Nomes e dados são fictícios."
          />
          <HelpFigure
            src="/como-funciona/vinculo-profissional-2026-11-22.png"
            alt="Captura de Meus pacientes mostrando onde a profissional digita o código de vínculo."
            caption="Meus pacientes · Vincular paciente — captura feita em 22/11/2026. Dados fictícios."
          />
        </div>
        <p className="text-sm text-muted">As telas podem mudar depois da data da captura; o passo a passo escrito continua indicando o nome dos botões.</p>
      </Section>

      <Section id="atividades" title="Atividades e registros">
        <p>
          Cada área ajuda a organizar um tipo de experiência. Os registros são seus; a psicóloga ou psiquiatra só os vê
          quando você libera a área correspondente. Na dúvida sobre o uso clínico de uma área, converse com a sua
          psicóloga.
        </p>
        <RecordGuide id="atividades-area" title="Atividades" clinical>
          <p>Registre o que planejou fazer e, se quiser, como foi. Por exemplo, uma caminhada, uma tarefa de casa ou um encontro.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Atividades. Atividades finalizadas não podem ser editadas nem apagadas.</p>
        </RecordGuide>
        <RecordGuide id="pensamentos" title="Pensamentos — Registro de Pensamentos (RPD)" clinical>
          <p>Organize uma situação, o pensamento que veio, as emoções, o que fez e o que aconteceu depois. Se quiser, acrescente uma explicação alternativa.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Pensamentos. Uma explicação alternativa pode ter prazo próprio.</p>
        </RecordGuide>
        <RecordGuide id="tensao" title="Tensão" clinical>
          <p>Anote episódios de tensão, o que estava acontecendo, a intensidade, o que você fez e o que veio depois.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Tensão. A tela também organiza os episódios por semana.</p>
        </RecordGuide>
        <RecordGuide id="acao" title="Ação" clinical>
          <p>Planeje uma ação de prazer, conexão ou realização e, depois, compare o que esperava com o que sentiu.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Ação. Você pode corrigir a avaliação até o fim do dia em que contou como foi.</p>
        </RecordGuide>
        <RecordGuide id="agenda" title="Consultas e ciclo da consulta" clinical>
          <p>Cadastre sua agenda para organizar o período entre sessões. O ciclo agrupa registros para você e sua psicóloga retomarem o que aconteceu nesse intervalo.</p>
          <p><strong>Quem vê:</strong> você; a profissional só vê a agenda se você liberar Consultas.</p>
        </RecordGuide>
        <RecordGuide id="planos" title="Meus Planos" clinical>
          <p>Guarde perguntas para responder quando uma situação combinada com a profissional acontecer. A psicóloga também pode criar um plano para você, se a área estiver liberada.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Meus Planos. Você administra seus planos e registros.</p>
        </RecordGuide>
        <RecordGuide id="tarefas" title="Tarefas" clinical>
          <p>Registre algo que ficou combinado na consulta e conte se conseguiu fazer, se não conseguiu ou se já não faz sentido.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Tarefas.</p>
        </RecordGuide>
        <RecordGuide id="sono-humor" title="Sono e humor" clinical>
          <p>Se quiser, anote horários de sono, notas para sono e humor e uma palavra ou frase para o dia. A pergunta sobre o remédio do dia pode ser ligada em Conta.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar cada área correspondente.</p>
        </RecordGuide>
        <RecordGuide id="medicamentos" title="Remédios e o que sinto" clinical>
          <p>Se ativar em Conta, você pode anotar remédios, mudanças e o que tem sentido. O Faísca não avalia sintomas nem sugere dose, troca ou interrupção de medicamento.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Remédios e o que sinto.</p>
        </RecordGuide>
        <RecordGuide id="sobre-mim" title="Sobre mim" clinical>
          <p>Compartilhe, se quiser, informações sobre você, o que gostaria de trabalhar e hábitos que quer deixar ou já deixou.</p>
          <p><strong>Quem vê:</strong> você e as profissionais a quem liberar Sobre mim.</p>
        </RecordGuide>
        <RecordGuide id="avisos" title="Avisos">
          <p>Leia comunicados gerais da profissional vinculada, como férias, feriados e mudanças de agenda.</p>
          <p><strong>Quem vê:</strong> você vê os avisos da sua profissional enquanto o vínculo existir. Outros pacientes não veem seus registros.</p>
        </RecordGuide>
        <RecordGuide id="buscar-ligar" title="Buscar e ligar registros">
          <p>Busque seus registros por palavra, período e alguns filtros. Você também pode ligar dois registros seus para encontrar o contexto relacionado depois.</p>
          <p><strong>Quem vê:</strong> a busca é privada. A profissional só vê uma ligação quando as duas áreas estão liberadas para ela.</p>
        </RecordGuide>
      </Section>

      <Section id="mensagens" title="Mensagens privadas">
        <p>Abra Mensagens no topo para combinar detalhes da consulta ou tirar dúvidas breves com a profissional vinculada. Combine com ela os horários de contato. Para urgências, procure atendimento de urgência.</p>
        <p><strong>Quem vê:</strong> só as duas pessoas do vínculo ativo, depois que ambas aceitarem o aviso de privacidade. Em <strong>Conta → Notificações</strong>, você pode escolher se quer receber avisos de mensagens.</p>
      </Section>

      <Section id="profissionais" title="Para psicólogas e psiquiatras">
        <p>
          A profissional acompanha apenas pacientes com vínculo ativo e as áreas que cada pessoa liberou. As telas são
          de leitura; a psicóloga tem a exceção de poder criar um novo plano de ação para o paciente nas condições
          explicadas em Meus Planos.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Ciclo da consulta:</strong> para a psicóloga, organiza o período entre sessões quando a agenda está liberada.</li>
          <li><strong>Para ler:</strong> reúne registros que ainda não foram marcados como lidos ou que mudaram depois da leitura.</li>
          <li><strong>Mural:</strong> permite publicar avisos gerais para pacientes vinculados.</li>
        </ul>
        <p>O Faísca não envia à profissional o texto de cada registro por e-mail ou push.</p>
      </Section>

      <Section id="comunidade" title="Comunidade de apoio">
        <p>
          A comunidade é opcional e pode ser criada pela psicóloga. Na primeira versão, é para maiores de 18 anos. Quem
          participa escolhe um apelido; os outros membros não veem o nome nem o e-mail da conta.
        </p>
        <p>
          Publicações e comentários passam por revisão humana antes de aparecer. A comunidade não dá acesso aos seus
          registros clínicos. A revisão pode ser feita pela plataforma ou, se a psicóloga ativar essa opção com a
          verificação em duas etapas, por ela. Conteúdo escrito pela própria psicóloga continua com a plataforma.
        </p>
        <p>
          Se quiser, o grupo recebe uma mensagem neutra quando você entra. Membros ativos veem publicações anteriores à
          sua entrada. Se sair, você pode pedir para entrar de novo; o acesso também fica suspenso quando o vínculo
          termina.
        </p>
      </Section>

      <Section id="instalar" title="Instalar no celular">
        <p>
          O Faísca é um aplicativo web progressivo (PWA): você abre pelo navegador e pode adicionar um atalho à tela
          inicial. A instalação não exige loja de aplicativos; para consultar seus registros, você ainda precisa de
          conexão com a internet.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li><strong>Android:</strong> abra o Faísca no Chrome, toque no menu ⋮ e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
          <li><strong>iPhone:</strong> abra o Faísca no Safari, toque em <strong>Compartilhar</strong> e escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Confirme. Depois, toque no ícone do Faísca na tela inicial para abrir.</li>
        </ol>
        <p className="text-sm text-muted">Os nomes e a posição das opções podem variar conforme a versão do navegador e do aparelho.</p>
      </Section>

      <Section id="seguranca" title="Segurança e privacidade">
        <ul className="list-disc space-y-2 pl-5">
          <li>Seus registros são vistos por você e somente pelas profissionais com vínculo ativo nas áreas que você liberou.</li>
          <li>A conexão usa HTTPS e as cópias de segurança são criptografadas.</li>
          <li>O Faísca não vende dados nem mostra anúncios.</li>
          <li>Em Conta, você pode trocar a senha, sair de todos os aparelhos e excluir a conta.</li>
        </ul>
        <p>
          O aviso de privacidade explica os dados tratados, os locais de armazenamento e os prazos. Para relatar um
          problema de segurança, escreva para <a className={linkClass} href="mailto:suporte@minhafaisca.com.br">suporte@minhafaisca.com.br</a>.
        </p>
        <Link to="/privacidade" className={`${linkClass} self-start`}>Ler o aviso de privacidade</Link>
      </Section>

      <Section id="ditado" title="Ditar em vez de digitar">
        <p>Se preferir, use o microfone do teclado do celular. O Faísca recebe o texto ditado; não grava o áudio.</p>
        <h3 className="text-lg font-semibold">Teclado Samsung (Android)</h3>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Abra <strong>Configurações → Gerenciamento geral → Configurações do Teclado Samsung → Entrada por voz</strong> ou <strong>Ditado de voz</strong>.</li>
          <li>Escolha a digitação por voz do Google ou a entrada por voz Samsung e permita o uso do microfone.</li>
          <li>Durante a digitação, procure o microfone no canto inferior esquerdo ou no menu “···” da barra do teclado.</li>
        </ol>
        <h3 className="text-lg font-semibold">Gboard (Android)</h3>
        <p>Toque no microfone no canto superior direito do teclado. Se ele não aparecer, você pode instalar o Gboard pela Play Store e selecioná-lo em <strong>Lista de teclados e padrão</strong>.</p>
        <h3 className="text-lg font-semibold">iPhone</h3>
        <p>Toque no microfone do teclado. Se não aparecer, vá a <strong>Ajustes → Geral → Teclado</strong> e ative <strong>Ditado</strong>.</p>
        <p>Diga “vírgula” ou “ponto final” para pontuar e revise o texto antes de salvar. O ditado do teclado só envia texto ao Faísca; gravações de áudio para a profissional são outra funcionalidade.</p>
        <p>Na dúvida, converse com a sua psicóloga.</p>
      </Section>

      <Section id="perguntas" title="Perguntas frequentes">
        <details className="border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">A profissional vê meus registros assim que eu salvo?</summary>
          <p className="mt-2 text-muted">Ela pode consultar os registros ao abrir o Faísca, se o vínculo estiver ativo e você tiver liberado a área. O app não envia o texto de cada registro por aviso.</p>
        </details>
        <details className="border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Posso editar ou apagar um registro?</summary>
          <p className="mt-2 text-muted">Depende da área e do prazo. Você pode corrigir uma Ação avaliada até o fim do dia em que contou como foi. Atividades finalizadas e Ações marcadas como não realizadas ficam guardadas como estão. Se tiver dúvida, converse com sua profissional.</p>
        </details>
        <details className="border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Esqueci minha senha. O que faço?</summary>
          <p className="mt-2 text-muted">Na tela <Link to="/entrar" className={linkClass}>Entrar</Link>, escolha “Esqueci minha senha” e siga as instruções enviadas ao seu e-mail.</p>
        </details>
        <details className="border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Como saio de todos os aparelhos?</summary>
          <p className="mt-2 text-muted">Em Conta → Segurança, escolha “Sair de todos os aparelhos” e confirme com sua senha.</p>
        </details>
        <details className="border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Onde ficam meus dados?</summary>
          <p className="mt-2 text-muted">Os serviços e cópias ficam em diferentes regiões, inclusive fora do Brasil. O aviso de privacidade informa os provedores e os locais.</p>
        </details>
        <details className="border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Como excluo minha conta?</summary>
          <p className="mt-2 text-muted">Em Conta, escolha “Excluir conta” e confirme com a senha. A exclusão dos dados no app é imediata e não pode ser desfeita. As cópias de segurança expiram em até cinco semanas; veja os detalhes no <Link to="/privacidade" className={linkClass}>aviso de privacidade</Link>.</p>
        </details>
      </Section>

      <Section id="sobre" title="Quem está por trás do Faísca">
        <p>
          O Faísca é um produto digital independente criado por Lucas Pereira de Lima para apoiar atividades da Terapia
          Cognitivo-Comportamental no dia a dia entre sessões. Ele não substitui o atendimento com uma profissional.
        </p>
        <p>
          Dúvidas ou pedidos sobre a conta: <a className={linkClass} href="mailto:suporte@minhafaisca.com.br">suporte@minhafaisca.com.br</a>.
        </p>
        <p>
          Para comunicar uma possível falha de segurança, use o mesmo endereço e escreva “Segurança” no assunto.
        </p>
      </Section>

      <footer className="flex flex-wrap gap-4 border-t border-border pt-5 text-sm">
        <Link to="/entrar" className={`${linkClass} inline-flex min-h-11 items-center`}>Entrar</Link>
        <Link to="/cadastro" className={`${linkClass} inline-flex min-h-11 items-center`}>Criar conta</Link>
        <Link to="/privacidade" className={`${linkClass} inline-flex min-h-11 items-center`}>Aviso de privacidade</Link>
      </footer>
    </main>
  );
}
