import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type UserRole = Database['public']['Enums']['user_role'];
export type RoleFilter = UserRole | 'all';

const PAGE_SIZE = 25;

export function useUserList() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const fetchIdRef = useRef(0);

  // Debounce raw input → search
  useEffect(() => {
    const t = setTimeout(() => setSearch(inputValue), 350);
    return () => clearTimeout(t);
  }, [inputValue]);

  const fetchProfiles = useCallback(
    async (searchVal: string, roleVal: RoleFilter, pageVal: number) => {
      const fetchId = ++fetchIdRef.current;
      setLoading(true);
      setError(null);

      const from = pageVal * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })
        .range(from, to);

      if (searchVal.trim()) {
        query = query.or(
          `name.ilike.%${searchVal}%,surname.ilike.%${searchVal}%,email.ilike.%${searchVal}%`,
        );
      }

      if (roleVal !== 'all') {
        query = query.eq('role', roleVal);
      }

      const { data, error: err } = await query;

      if (fetchIdRef.current !== fetchId) return;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const rows = data ?? [];
      setProfiles(pageVal === 0 ? rows : (prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    setPage(0);
    fetchProfiles(search, roleFilter, 0);
  }, [search, roleFilter, fetchProfiles]);

  const loadNextPage = useCallback(() => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchProfiles(search, roleFilter, nextPage);
    }
  }, [loading, hasMore, page, search, roleFilter, fetchProfiles]);

  const changeRole = useCallback(
    async (profileId: string, newRole: UserRole): Promise<{ error: string | null }> => {
      // Guard: prevent demoting the sole admin
      if (newRole !== 'admin') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('id, role')
            .eq('user_id', user.id)
            .single();

          if (myProfile?.id === profileId && myProfile?.role === 'admin') {
            const { count } = await supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('role', 'admin');
            if ((count ?? 0) <= 1) {
              return { error: 'No puedes cambiar tu rol si eres el único administrador.' };
            }
          }
        }
      }

      const { error: err } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profileId);

      if (err) return { error: err.message };

      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p)),
      );
      return { error: null };
    },
    [],
  );

  const refresh = useCallback(() => {
    setPage(0);
    fetchProfiles(search, roleFilter, 0);
  }, [search, roleFilter, fetchProfiles]);

  return {
    profiles,
    loading,
    error,
    inputValue,
    setInputValue,
    roleFilter,
    setRoleFilter,
    hasMore,
    loadNextPage,
    changeRole,
    refresh,
  };
}
