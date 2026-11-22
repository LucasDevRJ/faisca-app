import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import { MY_PERIOD_SUMMARY_KEY } from '../summary/use-summary';
import {
  addChange,
  createMedication,
  createSymptom,
  deleteChange,
  deleteMedication,
  deleteSymptom,
  deleteSymptomCheck,
  fetchMedications,
  fetchPatientMedications,
  saveSymptomCheck,
  updateChange,
  updateMedication,
  updateMedicationsSettings,
  updateSymptom,
  type ChangeInput,
  type ChangeUpdate,
  type MedicationInput,
  type MedicationUpdate,
  type SymptomInput,
  type SymptomUpdate,
} from './medications-api';

export const MEDICATIONS_KEY = ['medications'] as const;

// 403 é resposta definitiva (sem o aceite ou sem a caixa): tentar de novo não adianta.
const retry = (count: number, error: unknown) => getApiError(error).status !== 403 && count < 1;

// enabled = false sem o aceite do aviso que cita os remédios: nem pergunta à API.
export function useMedications(enabled: boolean) {
  return useQuery({ queryKey: MEDICATIONS_KEY, queryFn: enabled ? fetchMedications : skipToken, retry });
}

export function usePatientMedications(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['therapist', patientId, 'medications'],
    queryFn: enabled ? () => fetchPatientMedications(patientId) : skipToken,
    retry,
  });
}

// Toda gravação recarrega os remédios e o "Meu resumo", mesmo depois de erro.
function useMedicationMutation<I, O>(mutationFn: (input: I) => Promise<O>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: MEDICATIONS_KEY }),
        client.invalidateQueries({ queryKey: MY_PERIOD_SUMMARY_KEY }),
      ]),
  });
}

export const useMedicationsSettings = () => useMedicationMutation(updateMedicationsSettings);
export const useCreateMedication = () => useMedicationMutation((input: MedicationInput) => createMedication(input));
export const useUpdateMedication = () =>
  useMedicationMutation(({ id, input }: { id: string; input: MedicationUpdate }) => updateMedication(id, input));
export const useDeleteMedication = () => useMedicationMutation(deleteMedication);
export const useAddChange = () =>
  useMedicationMutation(({ id, input }: { id: string; input: ChangeInput }) => addChange(id, input));
export const useUpdateChange = () =>
  useMedicationMutation(({ id, changeId, input }: { id: string; changeId: string; input: ChangeUpdate }) =>
    updateChange(id, changeId, input),
  );
export const useDeleteChange = () =>
  useMedicationMutation(({ id, changeId }: { id: string; changeId: string }) => deleteChange(id, changeId));
export const useCreateSymptom = () => useMedicationMutation((input: SymptomInput) => createSymptom(input));
export const useUpdateSymptom = () =>
  useMedicationMutation(({ id, input }: { id: string; input: SymptomUpdate }) => updateSymptom(id, input));
export const useDeleteSymptom = () => useMedicationMutation(deleteSymptom);
export const useSaveSymptomCheck = () =>
  useMedicationMutation(({ id, date, intensity }: { id: string; date: string; intensity: number }) =>
    saveSymptomCheck(id, date, intensity),
  );
export const useDeleteSymptomCheck = () =>
  useMedicationMutation(({ id, date }: { id: string; date: string }) => deleteSymptomCheck(id, date));
