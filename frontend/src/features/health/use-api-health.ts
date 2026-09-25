import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

type HealthResponse = { status: 'ok'; timestamp: string };

async function fetchHealth() {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export function useApiHealth() {
  return useQuery({ queryKey: ['health'], queryFn: fetchHealth });
}
