import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { readStoredRegistrationSource } from '../lib/registrationSource';

export interface ContactInquiryInput {
  name: string;
  email: string;
  phone: string;
  socialMedia: string;
  affiliateExperience: 'sim' | 'nao';
  presentation: string;
}

export interface ContactInquiry extends ContactInquiryInput {
  id: string;
  createdAt: Timestamp | null;
  /** origem do lead capturada na chegada (ex.: 'vitrine-affiliacore'). */
  source?: string;
  /** @deprecated registros antigos gravavam `instagram`; usar `socialMedia`. */
  instagram?: string;
}

const contactsCollection = collection(db, 'contacts');

export async function createContactInquiry(input: ContactInquiryInput) {
  const base = { ...input, createdAt: serverTimestamp() };
  // Carimbo automático da origem (lib/registrationSource, capturada no boot).
  const source = readStoredRegistrationSource();
  if (!source) {
    await addDoc(contactsCollection, base);
    return;
  }
  try {
    await addDoc(contactsCollection, { ...base, source });
  } catch (error: any) {
    // Instância com rules antigas (allowlist de `contacts` sem 'source') não pode
    // perder o LEAD por causa do carimbo — reenvia sem a origem.
    if (error?.code !== 'permission-denied') throw error;
    await addDoc(contactsCollection, base);
  }
}

export function subscribeToContactInquiries(
  onData: (contacts: ContactInquiry[]) => void,
  onError?: (error: Error) => void,
) {
  const contactsQuery = query(contactsCollection, orderBy('createdAt', 'desc'));

  return onSnapshot(
    contactsQuery,
    (snapshot) => {
      const contacts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as ContactInquiryInput),
        createdAt: (doc.data().createdAt as Timestamp | null) ?? null,
      }));

      onData(contacts);
    },
    (error) => {
      onError?.(error);
    },
  );
}
