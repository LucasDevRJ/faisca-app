import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { api } from '../../lib/api';
import type { SessionUser } from './auth-api';
import { SESSION_ENDED_KEY, SESSION_QUERY_KEY } from './use-session';

// Ao voltar para o app ou trocar de tela, confere a sessão no máximo uma vez a cada 15 s.
const RECHECK_AFTER_MS = 15_000;

// Só existe enquanto alguém está logado (dentro do RequireAuth). A sessão pode terminar em outro
// aparelho ("Sair de todos", senha trocada) sem este saber (DEC-087). Então:
// - um 401 da API faz o app confirmar a sessão e, se ela acabou mesmo, apagar a memória; o
//   RequireAuth leva para entrar, com o aviso de sessão terminada;
// - ao voltar para o app (aba ou PWA de novo na tela) e ao trocar de tela, confere a sessão, porque
//   a tela nova pode vir da memória, sem nenhuma ida à API.
export function SessionWatcher() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const lastCheck = useRef(0);
  const recheck = useRef<() => void>(() => undefined);

  useEffect(() => {
    const controller = new AbortController();

    function endSession() {
      if (queryClient.getQueryData(SESSION_QUERY_KEY) === null) return;
      // A sessão vira null primeiro, para o RequireAuth tirar as telas da conta; depois some tudo o
      // que é da conta, inclusive o que estava sendo enviado. A segunda limpeza, no fim da fila,
      // pega o que uma tela ainda montada tenha pedido de novo nesse meio-tempo.
      queryClient.setQueryData(SESSION_ENDED_KEY, true);
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      const forget = () => {
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0] });
        queryClient.getMutationCache().clear();
      };
      forget();
      setTimeout(forget, 0);
    }

    // Pergunta à API se a sessão deste aparelho ainda vale. Com fetch, e não com o api, para não
    // passar pelo interceptor. Um 401 que só pegou o cookie de antes de uma troca de senha neste
    // aparelho não derruba ninguém: a confirmação já sai com o cookie novo.
    async function verify() {
      const current = queryClient.getQueryData<SessionUser | null>(SESSION_QUERY_KEY);
      if (!current) return;
      try {
        const res = await fetch(new URL('/api/auth/me', window.location.origin), {
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.status === 401) return endSession();
        if (!res.ok) return;
        const { user } = (await res.json()) as { user: SessionUser };
        // Só atualiza se ainda é a mesma conta logada (ninguém saiu nem entrou no meio do caminho).
        const now = queryClient.getQueryData<SessionUser | null>(SESSION_QUERY_KEY);
        if (now && now.id === user.id) queryClient.setQueryData(SESSION_QUERY_KEY, user);
      } catch {
        // Sem rede ou desmontado: tenta de novo na próxima vez.
      }
    }

    const interceptor = api.interceptors.response.use(undefined, (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 401) void verify();
      return Promise.reject(error);
    });

    // Acabou de entrar ou de abrir o app: a sessão acabou de ser lida, não precisa conferir já.
    lastCheck.current = Date.now();
    recheck.current = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck.current < RECHECK_AFTER_MS) return;
      lastCheck.current = Date.now();
      void verify();
    };
    const onVisibility = () => recheck.current();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      controller.abort();
      api.interceptors.response.eject(interceptor);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queryClient]);

  useEffect(() => {
    recheck.current();
  }, [pathname]);

  return null;
}
