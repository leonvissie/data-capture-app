export type Profile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  displayName: string | null;
  authProvider: string | null;
  authSubject: string | null;
};

export type MovieUserState = {
  profileId: string;
  movieId: string;
  watchCount: number;
  updatedAt: string;
};

export type WatchStateMap = Record<string, number>;
