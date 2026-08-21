import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getAuthToken, setAuthToken } from "../api/client";
import { getMe, type LoginResponse } from "../api/auth";

type AuthUser = LoginResponse["user"];

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (res: LoginResponse) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  function signIn(res: LoginResponse) {
    setAuthToken(res.token);
    setUser(res.user);
  }

  function signOut() {
    setAuthToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
