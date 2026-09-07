import { createTheme } from '@mantine/core';

/** Shade 6 is the brand orange from the wordmark (`.brand-name-bytes`);
    the rest of the scale is derived from it so Mantine variants
    (`light`, `filled`, hover states) resolve in both colour schemes. */
export const theme = createTheme({
  colors: {
    brand: [
      '#fff3e6',
      '#ffe0c2',
      '#ffc794',
      '#ffad66',
      '#ff9743',
      '#ff8a2b',
      '#ff6a00',
      '#e35c00',
      '#c94f00',
      '#ad4100',
    ],
  },
});
