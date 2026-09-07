import {
  ActionIcon,
  AppShell,
  Group,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { Link } from 'react-router';

export default function Header() {
  const { setColorScheme } = useMantineColorScheme();
  // `auto` resolves to whatever the system is asking for, so the toggle always
  // flips away from what the viewer is actually looking at.
  const scheme = useComputedColorScheme('dark', {
    getInitialValueInEffect: true,
  });
  const isDark = scheme === 'dark';

  return (
    <AppShell.Header>
      <Group h="100%" px="md" justify="space-between" align="end">
        {/* Home is the app's reset: `/` carries no search params, so this
            clears the query, type, country, sort and page in one click. */}
        <UnstyledButton
          component={Link}
          to="/"
          aria-label="Micro Bytes home — clear search"
          style={{ display: 'flex', alignItems: 'center' }}
        >
          {/* Picked from the resolved scheme rather than a `prefers-color-scheme`
              source, or the logo would ignore a manual toggle. */}
          <img
            src={`/images/microbytes-horizontal-${isDark ? 'dark' : 'light'}.svg`}
            alt="Micro Bytes"
            height="40"
          />
        </UnstyledButton>
        <ActionIcon
          variant="default"
          size="lg"
          mb={8}
          onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
      </Group>
    </AppShell.Header>
  );
}
