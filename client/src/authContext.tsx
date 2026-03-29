import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi, type AuthUser } from "./authApi.js";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "signedOut"; user: null }
  | { status: "signedIn"; user: AuthUser };

type AuthContextValue = {
  state: AuthState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  const refresh = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setState({ status: "signedIn", user });
    } catch {
      setState({ status: "signedOut", user: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* still clear client */
    }
    setState({ status: "signedOut", user: null });
  }, []);

  const value = useMemo(
    () => ({ state, refresh, signOut }),
    [state, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
