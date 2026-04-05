import { useEffect, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';

interface Props {
  label: string;
  language: string;
  code: string;
}

export function CodeSnippet({ label, language, code }: Props) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/80">
        <span className="text-xs font-semibold text-neutral-400">{label}</span>
        <button
          onClick={handleCopy}
          className={`px-3 py-1 rounded text-xs border transition-colors ${
            copied ? 'border-green-600 text-green-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="!m-0 !rounded-none !bg-neutral-950 p-4 overflow-x-auto">
        <code ref={codeRef} className={`language-${language} !text-[13px] !leading-relaxed`}>
          {code}
        </code>
      </pre>
    </div>
  );
}
