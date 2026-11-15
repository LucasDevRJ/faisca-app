import { HttpResponse, http } from 'msw';
import { screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { server, loggedIn, fakeUser, apiError } from '../test/server';
import type { Task } from '../features/tasks/tasks-api';
import type { PatientSummary } from '../features/therapist/therapist-api';
const id = '00000000-0000-4000-8000-0000000000a1';
const fakeTask: Task = { id, title: 'Reflexão fictícia', description: 'Refletir sobre uma situação fictícia.', agreedWith: null, agreedLinkId: null, responseStatus: null, responseText: null, respondedAt: null, responseDeadline: null, responseEditable: true, createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z' };
beforeEach(() => server.use(loggedIn));
function tasksApi(task?: Task) {
  let tasks = task ? [task] : [];
  const writes: unknown[] = [];
  server.use(
    http.get('*/api/tasks', () => HttpResponse.json({ tasks })),
    http.post('*/api/tasks', async ({ request }) => { const body = await request.json() as object; writes.push(body); const saved = { ...fakeTask, ...body }; tasks = [saved]; return HttpResponse.json({ task: saved }, { status: 201 }); }),
    http.put('*/api/tasks/:id/response', async ({ request }) => { const body = await request.json() as object; writes.push(body); const saved = { ...fakeTask, ...body, respondedAt: '2026-09-24T12:00:00.000Z' }; tasks = [saved]; return HttpResponse.json({ task: saved }); }),
    http.delete('*/api/tasks/:id', () => { tasks = []; return new HttpResponse(null, { status: 204 }); }),
  );
  return writes;
}
it('mostra a aba sempre e cria uma tarefa com os textos aprovados', async () => {
  const user = userEvent.setup(); const writes = tasksApi(); renderRoute('/tarefas');
  expect(await screen.findByRole('heading', { name: 'Tarefas', level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Tarefas' })).toHaveAttribute('aria-current', 'page');
  expect(await screen.findByText('Você pode anotar aqui uma tarefa combinada na consulta.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Nova tarefa' }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('O que ficou combinado?'), 'Descrição fictícia da tarefa');
  await user.click(within(dialog).getByRole('button', { name: 'Salvar tarefa' }));
  expect(await screen.findByText('Tarefa salva.')).toBeInTheDocument();
  expect(writes).toEqual([{ title: null, description: 'Descrição fictícia da tarefa', agreedLinkId: null }]);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
});
it('pede aceite e não oferece criação antes dele', async () => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, tasks: false } } })));
  renderRoute('/tarefas');
  expect(await screen.findByRole('checkbox')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nova tarefa' })).not.toBeInTheDocument();
});
it.each(['Não consegui fazer', 'Não faz sentido para mim agora'])('salva %s sem exigir comentário', async (name) => {
  const user = userEvent.setup(); const writes = tasksApi(fakeTask); renderRoute('/tarefas');
  await user.click(await screen.findByRole('button', { name: /Responder.*Reflexão fictícia/ }));
  await user.click(screen.getByRole('radio', { name }));
  await user.click(screen.getByRole('button', { name: 'Salvar resposta' }));
  expect(await screen.findByText('Resposta salva.')).toBeInTheDocument();
  expect(writes).toEqual([{ responseStatus: name === 'Não consegui fazer' ? 'NAO_CONSEGUI' : 'NAO_FAZ_SENTIDO', responseText: null }]);
});
it('responde em texto livre e permite editar enquanto o prazo está aberto', async () => {
  const user = userEvent.setup(); const writes = tasksApi(fakeTask); renderRoute('/tarefas');
  await user.click(await screen.findByRole('button', { name: /Responder.*Reflexão fictícia/ }));
  await user.type(screen.getByLabelText('Sua resposta (obrigatória)'), 'Minha reflexão fictícia.');
  await user.click(screen.getByRole('button', { name: 'Salvar resposta' }));
  expect(await screen.findByRole('button', { name: /Editar resposta.*Reflexão fictícia/ })).toBeInTheDocument();
  expect(writes).toEqual([{ responseStatus: 'RESPONDIDA', responseText: 'Minha reflexão fictícia.' }]);
  expect(screen.queryByRole('button', { name: /Apagar tarefa/ })).not.toBeInTheDocument();
});
it('resposta final fica só para leitura', async () => {
  tasksApi({ ...fakeTask, respondedAt: '2026-09-24T12:00:00.000Z', responseStatus: 'RESPONDIDA', responseText: 'Texto fictício.', responseEditable: false }); renderRoute('/tarefas');
  expect(await screen.findByText('Resposta final, guardada para o seu histórico.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Editar resposta/ })).not.toBeInTheDocument();
});
it('exibe erro da API sem perder a resposta digitada', async () => {
  const user = userEvent.setup(); tasksApi(fakeTask);
  server.use(http.put('*/api/tasks/:id/response', () => apiError(409, 'TASK_RESPONSE_FINAL', 'A resposta ficou final na consulta.')));
  renderRoute('/tarefas'); await user.click(await screen.findByRole('button', { name: /Responder.*Reflexão fictícia/ }));
  await user.type(screen.getByLabelText('Sua resposta (obrigatória)'), 'Reflexão fictícia preservada.');
  await user.click(screen.getByRole('button', { name: 'Salvar resposta' }));
  expect(await screen.findByText('A resposta ficou final na consulta.')).toBeInTheDocument();
  expect(screen.getByLabelText('Sua resposta (obrigatória)')).toHaveValue('Reflexão fictícia preservada.');
});
it('profissional vê tarefas compartilhadas só para leitura', async () => {
  const patientId = '00000000-0000-4000-8000-00000000000a';
  let denied = false;
  const summary: PatientSummary = { patient: { id: patientId, name: 'Paciente Fictícia', email: 'paciente@faisca.test', linkedAt: '2026-09-20T12:00:00.000Z', avatarVersion: null }, today: '2026-09-24', lastAppointment: null, nextAppointment: null, agendaStatus: null, pause: null, highlight: { from: '2026-09-21', to: '2026-09-27', reason: 'LAST_7_DAYS' }, access: { kind: 'PSICOLOGIA', sharedAreas: ['TASKS'] } };
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true }, activeProfile: 'therapist' } })),
    http.get('*/api/therapist/patients/:patientId', () => HttpResponse.json(summary)),
    http.get('*/api/therapist/patients/:patientId/tasks', () => denied ? apiError(403, 'FORBIDDEN', 'Acesso negado.') : HttpResponse.json({ tasks: [{ ...fakeTask, responseStatus: 'NAO_CONSEGUI', respondedAt: fakeTask.createdAt, readStatus: 'NAO_LIDO', readAt: null }] })),
  );
  const { queryClient } = renderRoute(`/pacientes/${patientId}?aba=tarefas`);
  expect(await screen.findByText('Refletir sobre uma situação fictícia.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Marcar como lido/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nova tarefa' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Editar resposta/ })).not.toBeInTheDocument();
  denied = true;
  await act(() => queryClient.invalidateQueries({ queryKey: ['therapist', patientId, 'tasks'] }));
  expect(await screen.findByText('Você não tem mais acesso a estas tarefas.')).toBeInTheDocument();
  expect(screen.queryByText(fakeTask.description)).not.toBeInTheDocument();
});

it('apaga uma tarefa sem resposta só depois da confirmação e devolve o foco', async () => {
  const user = userEvent.setup(); tasksApi(fakeTask); renderRoute('/tarefas');
  await user.click(await screen.findByRole('button', { name: /Apagar tarefa.*Reflexão fictícia/ }));
  const dialog = screen.getByRole('dialog', { name: 'Apagar esta tarefa?' });
  expect(screen.getByText('Refletir sobre uma situação fictícia.')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Apagar' }));
  expect(await screen.findByText('Tarefa apagada.')).toBeInTheDocument();
  expect(screen.queryByText('Refletir sobre uma situação fictícia.')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
});
it('edita a tarefa antes de responder e associa o erro ao campo de resposta', async () => {
  const user = userEvent.setup(); tasksApi(fakeTask); const writes: unknown[] = [];
  server.use(http.patch('*/api/tasks/:id', async ({ request }) => { const body = await request.json() as object; writes.push(body); return HttpResponse.json({ task: { ...fakeTask, ...body } }); }));
  renderRoute('/tarefas');
  await user.click(await screen.findByRole('button', { name: /Editar tarefa.*Reflexão fictícia/ }));
  await user.clear(screen.getByLabelText('O que ficou combinado?'));
  await user.type(screen.getByLabelText('O que ficou combinado?'), 'Nova descrição fictícia.');
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
  expect(await screen.findByText('Tarefa salva.')).toBeInTheDocument();
  expect(writes).toEqual([{ title: 'Reflexão fictícia', description: 'Nova descrição fictícia.', agreedLinkId: null }]);
  await user.click(screen.getByRole('button', { name: /Responder.*Reflexão fictícia/ }));
  await user.click(screen.getByRole('button', { name: 'Salvar resposta' }));
  const field = screen.getByLabelText('Sua resposta (obrigatória)');
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveAccessibleDescription('Escreva sua resposta em até 10.000 caracteres.');
});
