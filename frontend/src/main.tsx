import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';

import App from './App.tsx';
import { theme } from './theme';
import { ApiError } from './api/http';

// Mantine provides this stylesheet at runtime, but does not expose TypeScript declarations for it.
// @ts-expect-error CSS side-effect imports are handled by the bundler.
import './index.css';
// @ts-expect-error CSS side-effect imports are handled by the bundler.
import '@mantine/core/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A response from our API is a decision, not a blip: retrying it just
      // burns more upstream quota. Only retry when the request never landed.
      retry: (failureCount, error) =>
        !(error instanceof ApiError) && failureCount < 2,
    },
  },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Applies the stored (or system) scheme before first paint, so a light
        viewer never sees a dark flash on load. */}
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
