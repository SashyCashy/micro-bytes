import type { ReactNode } from 'react';
import { AppShell, Container } from '@mantine/core';
import { Outlet } from 'react-router';

type BodyProps = {
  children?: ReactNode;
};

export default function Body({ children }: BodyProps) {
  return (
    <AppShell.Main>
      <Container size="lg" w="100%" px={{ base: 'md', sm: 'xl' }} py="xl">
        {children ?? <Outlet />}
      </Container>
    </AppShell.Main>
  );
}
