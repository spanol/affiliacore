import { describe, it, expect } from 'vitest';
import {
  NETWORK_INVITE_KIND,
  isNetworkInvite,
  isNetworkInviteActive,
  networkInviteBlock,
  sanitizeRecruitName,
  recruitNameError,
  networkInvitePath,
  buildNetworkInviteUrl,
} from './networkInvite';

describe('isNetworkInvite / isNetworkInviteActive', () => {
  it('só o doc com kind "network" é link de rede', () => {
    expect(isNetworkInvite({ kind: NETWORK_INVITE_KIND })).toBe(true);
    expect(isNetworkInvite({})).toBe(false);
    expect(isNetworkInvite(null)).toBe(false);
    // O convite PESSOAL não tem kind: continua caindo no fluxo antigo.
    expect(isNetworkInvite({ status: 'pending' } as any)).toBe(false);
  });

  it('ausência de status conta como ativo; "revoked" desativa', () => {
    expect(isNetworkInviteActive({ kind: NETWORK_INVITE_KIND })).toBe(true);
    expect(isNetworkInviteActive({ kind: NETWORK_INVITE_KIND, status: 'active' })).toBe(true);
    expect(isNetworkInviteActive({ kind: NETWORK_INVITE_KIND, status: 'revoked' })).toBe(false);
    expect(isNetworkInviteActive({ kind: NETWORK_INVITE_KIND, status: 'REVOKED' })).toBe(false);
  });

  it('link de rede NÃO expira nem é consumido (é captação, não credencial)', () => {
    // O convite pessoal vira 'used' no primeiro aceite; este segue valendo.
    const doc = { kind: NETWORK_INVITE_KIND, status: 'active', uses: 12 };
    expect(isNetworkInviteActive(doc)).toBe(true);
    expect(networkInviteBlock(doc)).toBeNull();
  });
});

describe('networkInviteBlock', () => {
  it('doc que não é de rede vira "não encontrado"', () => {
    expect(networkInviteBlock(null)).toBe('Convite não encontrado.');
  });

  it('revogado explica o que fazer, sem travessão de IA', () => {
    const msg = networkInviteBlock({ kind: NETWORK_INVITE_KIND, status: 'revoked' })!;
    expect(msg).toContain('desativado');
    expect(msg).not.toContain('—');
  });
});

describe('sanitizeRecruitName / recruitNameError', () => {
  it('colapsa espaços, apara e capa em 80', () => {
    expect(sanitizeRecruitName('  João   da  Silva ')).toBe('João da Silva');
    expect(sanitizeRecruitName('a'.repeat(200))).toHaveLength(80);
    expect(sanitizeRecruitName(null)).toBe('');
  });

  it('exige um nome de verdade', () => {
    expect(recruitNameError('')).toBe('Informe seu nome completo.');
    expect(recruitNameError('   ')).toBe('Informe seu nome completo.');
    expect(recruitNameError('J')).toBe('Informe seu nome completo.');
    expect(recruitNameError('Ana')).toBeNull();
  });
});

describe('URL do link', () => {
  it('monta o caminho público e a URL completa', () => {
    expect(networkInvitePath('abc123')).toBe('/cadastro/abc123');
    expect(buildNetworkInviteUrl('abc123', 'https://app.exemplo.com')).toBe('https://app.exemplo.com/cadastro/abc123');
  });

  it('não duplica a barra quando o origin já termina em /', () => {
    expect(buildNetworkInviteUrl('abc', 'https://app.exemplo.com/')).toBe('https://app.exemplo.com/cadastro/abc');
  });
});
