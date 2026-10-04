import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import {
  completeActivity,
  createActivity,
  deleteActivity,
  fetchActivities,
  markNotDone,
  startActivity,
  updateActivity,
  type Activity,
  type CompleteActivityInput,
  type CreateActivityInput,
  type UpdateActivityInput,
} from './activities-api';
import { addDays } from './week';

const ACTIVITIES_KEY = ['activities'] as const;

// Atividades de um período: a semana ou o ciclo da consulta (DEC-050).
export function useRangeActivities({ from, to }: { from: string; to: string }) {
  return useQuery({
    queryKey: [...ACTIVITIES_KEY, from, to],
    queryFn: () => fetchActivities(from, to),
  });
}

export function useWeekActivities(monday: string) {
  return useRangeActivities({ from: monday, to: addDays(monday, 6) });
}

// Erro da segunda chamada de um passo duplo (DEC-029): a primeira já gravou.
export class PartialSaveError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'PartialSaveError';
  }
}

// Texto pronto para a tela, para qualquer erro das mutations abaixo.
export function activityErrorMessage(error: unknown): string {
  return error instanceof PartialSaveError ? error.message : getApiError(error).message;
}

// Faz a segunda chamada; se ela falhar, avisa que a primeira já foi salva.
async function secondStep<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new PartialSaveError(message, error);
  }
}

export type CreateRequest =
  | CreateActivityInput
  | { status: 'NAO_REALIZADA'; name: string; activityDate: string; observation?: string };

export type CompleteRequest = CompleteActivityInput & {
  activity: Activity;
  // Só para uma PLANEJADA: a vontade que falta para passar por PENDENTE.
  wantBefore?: number;
};

// Toda gravação recarrega as semanas em memória. Mesmo depois de erro, porque um passo
// duplo pode ter gravado a primeira parte.
function useActivityMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ACTIVITIES_KEY }),
  });
}

export function useCreateActivity() {
  return useActivityMutation(async (input: CreateRequest) => {
    // A SPEC não cria direto como NAO_REALIZADA: cria planejada e marca em seguida.
    if (input.status === 'NAO_REALIZADA') {
      const { observation, ...rest } = input;
      const created = await createActivity({ ...rest, status: 'PLANEJADA' });
      return secondStep(
        () => markNotDone(created.id, observation),
        'Salvamos a atividade, mas não deu para marcar que não aconteceu. Tente de novo pelo card.',
      );
    }
    return createActivity(input);
  });
}

export function useUpdateActivity() {
  return useActivityMutation(({ id, ...input }: UpdateActivityInput & { id: string }) =>
    updateActivity(id, input),
  );
}

export function useStartActivity() {
  return useActivityMutation(({ id, wantBefore }: { id: string; wantBefore: number }) =>
    startActivity(id, wantBefore),
  );
}

export function useCompleteActivity() {
  return useActivityMutation(async ({ activity, wantBefore, ...input }: CompleteRequest) => {
    // "Conta como foi?" numa PLANEJADA: registra a vontade e conclui (DEC-029).
    if (activity.status === 'PLANEJADA') {
      if (wantBefore === undefined) throw new Error('Falta a vontade para concluir uma atividade planejada.');
      await startActivity(activity.id, wantBefore);
      return secondStep(
        () => completeActivity(activity.id, input),
        'Salvamos a vontade, mas não deu para concluir. Tente de novo pelo card.',
      );
    }
    return completeActivity(activity.id, input);
  });
}

export function useMarkNotDone() {
  return useActivityMutation(({ id, observation }: { id: string; observation?: string }) =>
    markNotDone(id, observation),
  );
}

export function useDeleteActivity() {
  return useActivityMutation((id: string) => deleteActivity(id));
}
