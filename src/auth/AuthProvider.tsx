import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { auth, firebaseSetupMessage, isFirebaseConfigured } from "../firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  setupError: string;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    setupError: firebaseSetupMessage,
    async login(email, password) {
      if (!auth) {
        throw new Error(firebaseSetupMessage);
      }

      await signInWithEmailAndPassword(auth, email, password);
    },
    async signup(email, password) {
      if (!auth) {
        throw new Error(firebaseSetupMessage);
      }

      await createUserWithEmailAndPassword(auth, email, password);
    },
    async logout() {
      if (!auth) {
        return;
      }

      await signOut(auth);
    }
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
