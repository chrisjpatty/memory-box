import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Memories } from './pages/Memories';
import { MemoryView } from './pages/MemoryView';
import { Search } from './pages/Search';
import { Ingest } from './pages/Ingest';
import { Import } from './pages/Import';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="memories" element={<Memories />} />
          <Route path="memories/:id" element={<MemoryView />} />
          <Route path="search" element={<Search />} />
          <Route path="ingest" element={<Ingest />} />
          <Route path="import" element={<Import />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
