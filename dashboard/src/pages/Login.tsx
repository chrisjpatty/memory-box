import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.login(password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Memory Box</h1>
        <p className="text-neutral-500 mb-8">Admin Dashboard</p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-950 border border-red-800 text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <label htmlFor="password" className="block text-sm text-neutral-400 mb-2">
            Admin Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your admin password"
            required
            autoFocus
            className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
