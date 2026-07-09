import React, { useState, useEffect } from 'react';
import { User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [user, setUser] = useState(auth.getUser());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      auth.me().catch(() => { auth.logout(); setUser(null); });
    }
  }, [user]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await auth.login(username);
      auth.setUser(data);
      setUser(data);
    } catch (e) {
      setError(e.message || '登录失败');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    auth.logout();
    setUser(null);
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden md:inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-accent-soft text-info text-sm font-medium">
          <User className="h-3.5 w-3.5" />
          {user.display_name || user.username}
        </div>
        <Button size="sm" variant="ghost" onClick={logout}>退出</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <div className="search-box" style={{ width: '180px' }}>
        <User className="h-3.5 w-3.5 text-ink-subtle" />
        <input
          placeholder="输入用户名登录"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={50}
        />
      </div>
      <Button type="submit" size="sm" disabled={busy || !username.trim()}>
        <LogIn className="h-3.5 w-3.5" />
        {busy ? '登录中…' : '登录'}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}