export interface PublicProfile {
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  badges: Badge[];
  stats: PublicStats;
}

export interface Badge {
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  granted_at?: string;
}

export interface PublicStats {
  totalTasksCompleted: number;
  currentStreak: number;
  memberSince: string | null;
}

export interface ProfileSettings {
  isPublic: boolean;
  username: string | null;
  bio: string | null;
}
