import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { mfaPending as mfaPendingFromClaims, type MfaClaims } from '../lib/mfaSession';

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'client';
  avatarUrl?: string;
  affiliateId?: string;
  mustChangePassword?: boolean;
  isSpecial?: boolean; // B3 · afiliado especial (vê a própria sub-rede)
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** 2FA ligado e ainda não confirmado NESTA sessão → o app mostra o desafio. */
  mfaPending: boolean;
  /** Rechecar após digitar o código (renova o token p/ pegar as claims novas). */
  refreshMfa: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  mfaPending: false,
  refreshMfa: async () => {},
});

// Lê as claims do ID token. Este cálculo é de UX: quem ENFORÇA o 2FA é o servidor
// (gate do requireAuth). Por isso, se as claims não puderem ser lidas, seguimos sem
// trancar a tela — um erro transitório não deve deixar ninguém preso fora da conta.
async function readMfaPending(currentUser: User | null): Promise<boolean> {
  if (!currentUser || typeof (currentUser as any).getIdTokenResult !== 'function') return false;
  try {
    const result = await currentUser.getIdTokenResult();
    return mfaPendingFromClaims(result?.claims as MfaClaims);
  } catch {
    return false;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);

  // Rechecagem após digitar o código: renova o ID token (as claims novas só entram
  // no token seguinte) e recalcula o estado.
  const refreshMfa = useCallback(async () => {
    const currentUser = auth.currentUser;
    try {
      await currentUser?.getIdToken(true);
    } catch {
      // sem rede/token: cai na leitura abaixo, que já é tolerante
    }
    setMfaPending(await readMfaPending(currentUser ?? null));
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setMfaPending(await readMfaPending(currentUser));

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        // R14: na TROCA de conta (A→B), até o profile do novo usuário chegar, não
        // exponha o perfil/loading do anterior — senão o ProtectedRoute roteia com o
        // papel errado (user=B, profile=A, loading=false). Volta a "carregando" e
        // limpa o perfil obsoleto; o snapshot abaixo seta os dois. (No 1º login já é
        // o estado inicial; updates de profile NÃO repassam aqui, só o snapshot.)
        setProfile(null);
        setLoading(true);
        const path = `users/${currentUser.uid}`;
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          unsubscribeProfile = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
            } else {
              setProfile(null);
            }
            setLoading(false);
          }, (error) => {
            console.error('Error fetching profile snapshot:', error);
            handleFirestoreError(error, OperationType.GET, path);
            setProfile(null);
            setLoading(false);
          });
        } catch (error: any) {
          console.error('Error fetching profile:', error);
          handleFirestoreError(error, OperationType.GET, path);
          setProfile(null);
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, mfaPending, refreshMfa }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
