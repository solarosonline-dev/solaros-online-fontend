import { createContext, useContext, useState, type ReactNode } from "react";
import { setAuthToken } from "../api/client";
import type { LoginResponse } from "../api/auth";

type AuthUser = LoginResponse["user"];

type AuthContextValue = {
  user: AuthUser | null;
  signIn: (res: LoginResponse) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  function signIn(res: LoginResponse) {
    setAuthToken(res.token);
    setUser(res.user);
  }

  function signOut() {
    setAuthToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
