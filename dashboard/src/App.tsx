import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Chat } from './pages/Chat';
import { Memories } from './pages/Memories';
import { MemoryView } from './pages/MemoryView';
import { Import } from './pages/Import';
import { ImportTwitter } from './pages/ImportTwitter';
import { ImportIngest } from './pages/ImportIngest';
import { ImportActivity } from './pages/ImportActivity';
import { AppShell } from './components/AppShell';
import { ChatLayout } from './components/ChatLayout';
import { MemoriesLayout } from './components/MemoriesLayout';
import { ImportLayout } from './components/ImportLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { General } from './pages/settings/General';
import { Tokens } from './pages/settings/Tokens';
import { DangerZone } from './pages/settings/DangerZone';
import { McpServer } from './pages/settings/McpServer';
import { OAuthConsent } from './pages/OAuthConsent';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="memories" element={<MemoriesLayout />}>
            <Route index element={<Memories />} />
            <Route path=":id" element={<MemoryView />} />
          </Route>
          <Route path="import" element={<ImportLayout />}>
            <Route index element={<ImportIngest />} />
            <Route path="github" element={<Import />} />
            <Route path="twitter" element={<ImportTwitter />} />
            <Route path="activity" element={<ImportActivity />} />
          </Route>
          <Route path="chat" element={<ChatLayout />}>
            <Route index element={<Chat />} />
            <Route path=":id" element={<Chat />} />
          </Route>
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<General />} />
            <Route path="tokens" element={<Tokens />} />
            <Route path="mcp" element={<McpServer />} />
            <Route path="danger-zone" element={<DangerZone />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/memories" replace />} />
    </Routes>
  );
}
