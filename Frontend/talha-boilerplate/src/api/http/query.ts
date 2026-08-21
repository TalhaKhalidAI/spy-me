import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnMount: false,
      staleTime: 15 * 60 * 1000,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      
    },
  },
});
