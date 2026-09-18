import { useEffect, useState } from 'react';
import { useGame } from '../store';

export default function Toast() {
  const reject = useGame((s) => s.game?.lastReject);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!reject) return;
    setMsg(reject);
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [reject]);
  if (!msg) return null;
  return <div className="fixed left-1/2 top-32 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">{msg}</div>;
}
