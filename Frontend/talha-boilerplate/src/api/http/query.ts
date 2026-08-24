import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 429 || error?.response?.status === 429) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnMount: false,
      staleTime: 15 * 60 * 1000,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  },
});
