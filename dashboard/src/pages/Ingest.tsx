import { useState, useRef, type FormEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Ingest() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ title: string; memoryId: string; contentType: string; error?: string } | null>(null);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setFiles(Array.from(e.dataTransfer.files));
    setContent('');
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.kind === 'file') {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) setFiles([file]);
        return;
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() && files.length === 0) return;
    setLoading(true);
    setResult(null);

    try {
      if (files.length > 0) {
        const base64 = await fileToBase64(files[0]);
        const r = await api.ingest({ content: base64, title: files[0].name });
        setResult({ title: r.title, memoryId: r.memoryId, contentType: r.contentType });
        setFiles([]);
      } else {
        const r = await api.ingest({ content: content.trim() });
        setResult({ title: r.title, memoryId: r.memoryId, contentType: r.contentType });
        setContent('');
      }
    } catch (err: any) {
      setResult({ title: '', memoryId: '', contentType: '', error: err.message });
    }

    setLoading(false);
  };

  const hasInput = content.trim() || files.length > 0;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Ingest</h1>
        <p className="text-neutral-500 text-sm">Drop anything in — text, a link, an image. It'll figure out the rest.</p>
      </div>

      {result && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          result.error
            ? 'bg-red-950 border border-red-800 text-red-400'
            : 'bg-green-950 border border-green-800 text-green-400'
        }`}>
          {result.error ? (
            <span>Failed: {result.error}</span>
          ) : (
            <span>
              Saved "{result.title}" as {result.contentType}.{' '}
              <button onClick={() => navigate(`/memories/${result.memoryId}`)} className="underline hover:text-green-300">
                View
              </button>
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-neutral-900 border rounded-xl transition-colors ${
            dragOver ? 'border-neutral-500 bg-neutral-800/30' : 'border-neutral-800'
          }`}
        >
          {files.length > 0 ? (
            <div className="p-6">
              <div className="flex items-center gap-3 bg-neutral-950 rounded-lg px-4 py-3">
                <span className="text-sm text-neutral-300 flex-1 truncate">{files[0].name}</span>
                <span className="text-xs text-neutral-600">{(files[0].size / 1024).toFixed(1)} KB</span>
                <button
                  type="button"
                  onClick={() => { setFiles([]); }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              placeholder="Paste a link, type a note, or drop a file..."
              rows={5}
              className="w-full px-6 py-5 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none resize-none"
              autoFocus
            />
          )}

          <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Attach file
              <input ref={fileInputRef} type="file" onChange={(e) => { if (e.target.files?.[0]) { setFiles([e.target.files[0]]); setContent(''); } }} className="hidden" />
            </button>
            <button
              type="submit"
              disabled={loading || !hasInput}
              className="px-5 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
