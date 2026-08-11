import { Badge, Code, Collapse, Stack, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import classes from './ToolActivity.module.css'

/**
 * A tool's involvement in a turn, as a chip rather than a wall of JSON.
 *
 * No tool is wired up in this POC, so this exists to keep the transcript
 * readable — and intact — on the day one is.
 */
export function ToolActivity({
  label,
  color,
  payload,
}: {
  label: string
  color: string
  payload: string
}) {
  const [isExpanded, { toggle }] = useDisclosure(false)

  return (
    <Stack gap={4} align="flex-start">
      <UnstyledButton
        className={classes.toggle}
        onClick={toggle}
        aria-expanded={isExpanded}
      >
        <Badge size="sm" variant="light" color={color}>
          {label}
        </Badge>
      </UnstyledButton>
      <Collapse expanded={isExpanded} className={classes.payload}>
        <Code block className={classes.code}>
          {payload}
        </Code>
      </Collapse>
    </Stack>
  )
}
