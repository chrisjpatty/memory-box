import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStatus } from '../hooks/queries';
import { api } from '../api';

export function OAuthConsent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: authStatus, isLoading: authLoading } = useAuthStatus();

  const clientId = searchParams.get('client_id') ?? '';
  const redirectUri = searchParams.get('redirect_uri') ?? '';
  const codeChallenge = searchParams.get('code_challenge') ?? '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') ?? '';
  const state = searchParams.get('state') ?? '';
  const scope = searchParams.get('scope') ?? '';

  const [clientName, setClientName] = useState<string | null>(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [clientError, setClientError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Redirect to login if not authenticated (with return URL)
  useEffect(() => {
    if (!authLoading && authStatus && !authStatus.authenticated) {
      const returnUrl = `/oauth/consent?${searchParams.toString()}`;
      navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`, { replace: true });
    }
  }, [authLoading, authStatus, navigate, searchParams]);

  // Fetch client info
  useEffect(() => {
    if (!clientId) {
      setClientError('Missing client_id parameter');
      setClientLoading(false);
      return;
    }
    api.oauthClientInfo(clientId)
      .then((data) => {
        setClientName(data.client_name);
        setClientLoading(false);
      })
      .catch((err) => {
        setClientError(err.message);
        setClientLoading(false);
      });
  }, [clientId]);

  const handleConsent = async (approved: boolean) => {
    setSubmitting(true);
    setError('');
    try {
      const result = await api.oauthConsent({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        state,
        scope,
        approved,
      });
      window.location.href = result.redirect_url;
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (authLoading || (authStatus && !authStatus.authenticated)) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Memory Box</h1>
        <p className="text-neutral-500 mb-8">Authorize application</p>

        {(error || clientError) && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-950 border border-red-800 text-red-400">
            {error || clientError}
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          {clientLoading ? (
            <p className="text-sm text-neutral-500">Loading...</p>
          ) : clientError ? (
            <p className="text-sm text-red-400">Could not load client information.</p>
          ) : (
            <>
              <p className="text-sm text-neutral-200 mb-4">
                <span className="font-semibold text-white">{clientName}</span>{' '}
                wants to access your Memory Box.
              </p>

              <div className="mb-5 px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Permissions</p>
                <p className="text-sm text-neutral-300">
                  Full access to memories — read, write, search, and delete via MCP
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleConsent(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 border border-neutral-700 text-neutral-400 rounded-lg text-sm font-medium hover:text-neutral-200 hover:border-neutral-600 disabled:opacity-50 transition-colors"
                >
                  Deny
                </button>
                <button
                  onClick={() => handleConsent(true)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Authorizing...' : 'Allow'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
