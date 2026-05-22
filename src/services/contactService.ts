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

export interface ContactInquiryInput {
  name: string;
  email: string;
  phone: string;
  instagram: string;
  affiliateExperience: 'sim' | 'nao';
  presentation: string;
}

export interface ContactInquiry extends ContactInquiryInput {
  id: string;
  createdAt: Timestamp | null;
}

const contactsCollection = collection(db, 'contacts');

export async function createContactInquiry(input: ContactInquiryInput) {
  await addDoc(contactsCollection, {
    ...input,
    createdAt: serverTimestamp(),
  });
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
