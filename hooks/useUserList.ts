import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { listProfiles, updateUserRole } from '@/lib/supabase/queries/profiles';
import type { ProfileRow } from '@/lib/supabase/queries/profiles';
import type { Database } from '@/lib/database.types';

type UserRole = Database['public']['Enums']['user_role'];

interface Filter {
  role?: UserRole;
  search?: string;
}

export function useUserList(filter?: Filter) {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows } = await listProfiles(filterRef.current ?? {});
      setProfiles(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, filter?.role, filter?.search]);

  const changeRole = useCallback(
    async (profileId: string, newRole: UserRole, currentProfile: ProfileRow) => {
      if (currentProfile.id === profileId && newRole !== 'admin') {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin');

        if ((count ?? 0) <= 1) {
          throw new Error('No puedes cambiar tu rol si eres el único administrador.');
        }
      }

      const updated = await updateUserRole(profileId, newRole);
      setProfiles((prev) => prev.map((p) => (p.id === profileId ? updated : p)));
    },
    []
  );

  return { profiles, loading, error, changeRole, refresh };
}
