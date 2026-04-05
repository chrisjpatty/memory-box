import { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { api } from '../api';

export function ProtectedRoute() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauthorized'>('loading');

  useEffect(() => {
    api.authStatus()
      .then((r) => setStatus(r.authenticated ? 'ok' : 'unauthorized'))
      .catch(() => setStatus('unauthorized'));
  }, []);

  if (status === 'loading') return null;
  if (status === 'unauthorized') return <Navigate to="/login" replace />;
  return <Outlet />;
}
