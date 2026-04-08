import { TokenCard } from '../../components/TokenCard';

export function Tokens() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-1">API Tokens</h2>
        <p className="text-sm text-neutral-500">Create and manage tokens for API access</p>
      </div>
      <TokenCard />
    </div>
  );
}
