import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_USER_DATA, migrate, type UserData } from '@/domain/userData';

export type { UserData };

/**
 * Persistence boundary. Today: device storage. Later: a `CloudUserDataStore`
 * (e.g. Supabase / Firebase) keyed by the signed-in user id, optionally wrapping
 * this local store as an offline cache.
 */
export interface UserDataStore {
  load(userId: string): Promise<UserData>;
  save(userId: string, data: UserData): Promise<void>;
  clear(userId: string): Promise<void>;
}

const key = (userId: string) => `mealmatch:user:${userId}:v1`;

export class LocalUserDataStore implements UserDataStore {
  async load(userId: string): Promise<UserData> {
    try {
      const raw = await AsyncStorage.getItem(key(userId));
      if (!raw) return DEFAULT_USER_DATA;
      return migrate(JSON.parse(raw));
    } catch {
      return DEFAULT_USER_DATA;
    }
  }

  async save(userId: string, data: UserData): Promise<void> {
    await AsyncStorage.setItem(key(userId), JSON.stringify(data));
  }

  async clear(userId: string): Promise<void> {
    await AsyncStorage.removeItem(key(userId));
  }
}

export const userDataStore: UserDataStore = new LocalUserDataStore();
