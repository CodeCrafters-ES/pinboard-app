import type { Database, Tables } from './database.types';

export type UserRole   = Database['public']['Enums']['user_role'];
export type PostStatus = 'draft' | 'published';
export type Post       = Tables<'posts'>;
