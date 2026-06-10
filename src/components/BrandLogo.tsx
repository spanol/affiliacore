import React, { useState } from 'react';
import { getBrandLogo } from '../lib/brand';

interface BrandLogoProps {
  name: string;
  brandId?: string;
  size?: number; // px
  className?: string;
}

// Logo da casa (asset estático em /public/brands). A API da OTG não fornece logo
// (verificado por probe), então hospedamos. Resolve por brandId, depois por nome.
// Fallback = avatar com a inicial quando não há logo ou a imagem falha (404). [[B6]]
export default function BrandLogo({ name, brandId, size = 28, className }: BrandLogoProps) {
  const logo = getBrandLogo(brandId) || getBrandLogo(name);
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size } as React.CSSProperties;

  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt={name}
        style={dim}
        onError={() => setFailed(true)}
        className={`rounded-lg object-contain bg-white shrink-0 ${className ?? ''}`}
      />
    );
  }
  return (
    <span
      style={dim}
      className={`rounded-lg bg-brand text-white flex items-center justify-center font-black text-xs shrink-0 ${className ?? ''}`}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
