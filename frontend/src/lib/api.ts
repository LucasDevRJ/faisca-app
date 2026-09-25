import axios from 'axios';

// Sempre /api no próprio domínio: o Vite (dev) e a Vercel (produção) repassam para a API.
// Assim o cookie de sessão é first-party (DEC-023). withCredentials garante o envio do cookie.
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
});
