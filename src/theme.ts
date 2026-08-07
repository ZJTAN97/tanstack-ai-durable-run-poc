import { createTheme } from '@mantine/core'

// The single place this project overrides Mantine's defaults. Design tokens go
// here so CSS Modules can read them as `var(--mantine-*)` rather than hardcode.
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
})
