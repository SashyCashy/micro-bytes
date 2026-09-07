import { AppShell } from '@mantine/core';
import Body from './AppShell/Body';
import Header from './AppShell/Header';

export default function Layout() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <Header />
      <Body />
    </AppShell>
  );
}
