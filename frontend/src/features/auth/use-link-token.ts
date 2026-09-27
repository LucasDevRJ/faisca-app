import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

// Lê o ?token= dos links enviados por e-mail e em seguida tira o token da barra de endereço,
// para ele não ficar no histórico, em favoritos ou em capturas de tela.
export function useLinkToken(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.search).get('token'));

  useEffect(() => {
    if (new URLSearchParams(location.search).has('token')) {
      navigate(location.pathname, { replace: true, state: location.state });
    }
  }, [location, navigate]);

  return token;
}
