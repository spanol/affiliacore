import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { readStoredRegistrationSource } from '../lib/registrationSource';

// Captação de LEAD do formulário público (landing + LeadDiagnostic). Escreve e
// só: o leitor (`subscribeToContactInquiries` + a tela /contacts) foi aposentado
// em 2026-08-08 com o B6 — a coleção `contacts` e a rule dela seguem valendo, e
// os leads passam a ser consultados fora do app. Se um dia voltar uma tela de
// leads, o leitor está no histórico do git (e `registrationSourceLabel`, em
// lib/registrationSource, continua lá para rotular a origem).

export interface ContactInquiryInput {
  name: string;
  email: string;
  phone: string;
  socialMedia: string;
  affiliateExperience: 'sim' | 'nao';
  presentation: string;
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
