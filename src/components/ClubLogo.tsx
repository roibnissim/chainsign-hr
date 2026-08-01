import React from 'react';

interface ClubLogoProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-28 h-28',
};

export const ClubLogo: React.FC<ClubLogoProps> = ({
  src,
  alt = 'לוגו האגודה',
  size = 'md',
  className = '',
}) => {
  const resolved = src || '/logo-placeholder.svg';

  return (
    <div
      className={`${sizeMap[size]} rounded-full overflow-hidden bg-white shadow-md ring-2 ring-white/80 shrink-0 ${className}`}
    >
      <img
        src={resolved}
        alt={alt}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/logo-placeholder.svg';
        }}
      />
    </div>
  );
};
