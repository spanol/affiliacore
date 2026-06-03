/**
 * PoC-03 — HIGH: fail-open redirect para /admin quando o papel é desconhecido.
 *
 * Finding: SECURITY-AUDIT.md -> HIGH · src/App.tsx:125-135 (DashboardRedirect)
 * CWE-636 (Not Failing Securely) · OWASP A01:2021
 *
 * `DashboardRedirect` manda usuário com profile null/sem-role para /admin
 * (default INSEGURO). O fix: cair em /profile (menor privilégio).
 *
 * Rodar:
 *   npx vitest run .security-pocs/poc-03-high-fail-open-redirect/component-test.spec.tsx
 *
 * PRÉ-REQUISITO DE SOURCE (uma linha): exporte DashboardRedirect em src/App.tsx
 *   trocar  `function DashboardRedirect() {`
 *   por     `export function DashboardRedirect() {`
 * (ver reproduce.md). Sem isso, o teste usa a CÓPIA-ESPELHO abaixo, que reflete
 * exatamente as linhas 125-135 do App.tsx atual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Navigate } from 'react-router-dom';

// --- mock do AuthContext: controlamos o que useAuth() retorna ----------------
const mockUseAuth = vi.fn();
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// --- CÓPIA-ESPELHO de src/App.tsx:125-135 (estado VULNERÁVEL atual) ----------
// Se você exportar o componente real, troque por:
//   import { DashboardRedirect } from '../../src/App';
function clientHome(profile: any) {
  if (profile?.isSpecial) return '/special';
  return '/dashboard';
}
function DashboardRedirect_VULNERABLE() {
  const { profile, loading } = mockUseAuth();
  if (loading) return null;
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;
  if (profile?.role === 'client') return <Navigate to={clientHome(profile)} replace />;
  return <Navigate to="/admin" replace />; // <-- FAIL-OPEN
}

// --- versão PATCHED (fallback = menor privilégio) ----------------------------
function DashboardRedirect_PATCHED() {
  const { profile, loading } = mockUseAuth();
  if (loading) return null;
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;
  if (profile?.role === 'client') return <Navigate to={clientHome(profile)} replace />;
  return <Navigate to="/profile" replace />; // <-- FAIL-SAFE
}

function renderAt(Component: React.FC) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Component />} />
        <Route path="/admin" element={<div>ADMIN AREA</div>} />
        <Route path="/profile" element={<div>PROFILE AREA</div>} />
        <Route path="/dashboard" element={<div>DASHBOARD AREA</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => mockUseAuth.mockReset());

describe('VULNERABLE — profile sem role cai em /admin', () => {
  it('user logado, profile null -> renderiza ADMIN AREA (fail-open)', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'x' }, profile: null, loading: false });
    renderAt(DashboardRedirect_VULNERABLE);
    expect(screen.getByText('ADMIN AREA')).toBeTruthy();
  });

  it('role desconhecido (ex: "" ) -> ADMIN AREA', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'x' }, profile: { role: '' }, loading: false });
    renderAt(DashboardRedirect_VULNERABLE);
    expect(screen.getByText('ADMIN AREA')).toBeTruthy();
  });
});

describe('PATCHED — fallback vai para menor privilégio', () => {
  it('user logado, profile null -> PROFILE AREA (fail-safe)', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'x' }, profile: null, loading: false });
    renderAt(DashboardRedirect_PATCHED);
    expect(screen.getByText('PROFILE AREA')).toBeTruthy();
    expect(screen.queryByText('ADMIN AREA')).toBeNull();
  });

  it('admin legítimo continua indo para /admin (não quebra fluxo bom)', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'a' }, profile: { role: 'admin' }, loading: false });
    renderAt(DashboardRedirect_PATCHED);
    expect(screen.getByText('ADMIN AREA')).toBeTruthy();
  });
});
