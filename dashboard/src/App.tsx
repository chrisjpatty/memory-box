import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Chat } from './pages/Chat';
import { Dashboard } from './pages/Dashboard';
import { Memories } from './pages/Memories';
import { MemoryView } from './pages/MemoryView';
import { Import } from './pages/Import';
import { ImportTwitter } from './pages/ImportTwitter';
import { ImportIngest } from './pages/ImportIngest';
import { ImportActivity } from './pages/ImportActivity';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Chat />} />
          <Route path="chat/*" element={<Chat />} />
          <Route path="memories" element={<Memories />} />
          <Route path="memories/:id" element={<MemoryView />} />
          <Route path="import" element={<ImportIngest />} />
          <Route path="import/github" element={<Import />} />
          <Route path="import/twitter" element={<ImportTwitter />} />
          <Route path="import/activity" element={<ImportActivity />} />
          <Route path="settings" element={<Dashboard />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
