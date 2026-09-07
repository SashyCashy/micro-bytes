import { BrowserRouter, Route, Routes } from 'react-router';
import { Stack, Title, Button, Text } from '@mantine/core';

import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ProductDetailsPage from './pages/ProductDetailsPage';
import RecipeDetailsPage from './pages/RecipeDetailsPage';
import RecipeSearchPage from './pages/RecipeSearchPage';

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary
        fallback={(e, reset) => (
          <Stack p="xl" gap="sm" align="flex-start">
            <Title order={2}>Something went wrong</Title>
            <Text c="dimmed">{e.message}</Text>
            <Button onClick={reset}>Try again</Button>
          </Stack>
        )}
      >
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<RecipeSearchPage />} />
            <Route path="recipes/:recipeId" element={<RecipeDetailsPage />} />
            <Route
              path="products/:productCode"
              element={<ProductDetailsPage />}
            />
          </Route>
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
