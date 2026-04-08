import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStatus } from '../hooks/queries';

export function ProtectedRoute() {
  const { data, isLoading, isError } = useAuthStatus();

  if (isLoading) return null;
  if (isError || !data?.authenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
