import type { Me } from '@ceed/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/**
 * Whoever is signed in. The session lives in an httpOnly cookie, so nothing
 * here holds a token — this only asks the server who it is talking to.
 */
export function useAccount() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/api/auth/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { me, loading, reload, setMe };
}
