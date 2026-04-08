import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStatus, useLogin, useSetup } from '../hooks/queries';

export function Login() {
  const navigate = useNavigate();
  const { data: authStatus, isLoading } = useAuthStatus();
  const login = useLogin();
  const setup = useSetup();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const isSetup = authStatus?.setupRequired ?? false;
  const mutation = isSetup ? setup : login;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (isSetup) {
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
    }

    mutation.mutate(password, {
      onSuccess: () => navigate('/', { replace: true }),
    });
  };

  if (isLoading) return null;

  const error = localError || (mutation.error as Error | null)?.message;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Memory Box</h1>
        <p className="text-neutral-500 mb-8">
          {isSetup ? 'Create a password to get started' : 'Admin Dashboard'}
        </p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-950 border border-red-800 text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <label htmlFor="password" className="block text-sm text-neutral-400 mb-2">
            {isSetup ? 'Password' : 'Admin Password'}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSetup ? 'Choose a password (min 8 characters)' : 'Enter your admin password'}
            required
            autoFocus
            className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
          />

          {isSetup && (
            <>
              <label htmlFor="confirmPassword" className="block text-sm text-neutral-400 mb-2 mt-4">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
              />
            </>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="mt-4 w-full px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending
              ? (isSetup ? 'Setting up...' : 'Signing in...')
              : (isSetup ? 'Create Password' : 'Sign In')
            }
          </button>
        </form>
      </div>
    </div>
  );
}
