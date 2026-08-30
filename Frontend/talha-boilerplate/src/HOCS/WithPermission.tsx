import React, { ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';

interface WithPermissionProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export const WithPermission: React.FC<WithPermissionProps> = ({
  permission,
  children,
  fallback = null,
}) => {
  const { user } = useAuthStore();

  if (!user) {
    return <>{fallback}</>;
  }

  // Admin bypass
  if (user.role === 'ADMIN') {
    return <>{children}</>;
  }

  // Check permissions array - handle both object format { name: '...' } and string format '...'
  const hasPermission = user.permissions?.some(
    (p: any) => p.name === permission || p === permission
  );

  if (hasPermission) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
