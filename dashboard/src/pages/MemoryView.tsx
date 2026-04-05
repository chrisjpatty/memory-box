import { useParams } from 'react-router-dom';
import { MemoryDetail } from '../components/MemoryDetail';

export function MemoryView() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <MemoryDetail memoryId={id} />;
}
