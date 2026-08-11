import { Collapse, Stack, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import classes from './ThoughtProcess.module.css'

/**
 * A model's reasoning, out of the way of its answer.
 *
 * Collapsed by default because reasoning is often longer than the answer it
 * produces, and rendered inline at the same weight it buries it.
 */
export function ThoughtProcess({ reasoning }: { reasoning: string }) {
  const [isExpanded, { toggle }] = useDisclosure(false)

  return (
    <Stack gap={4}>
      <UnstyledButton
        className={classes.toggle}
        onClick={toggle}
        aria-expanded={isExpanded}
      >
        <Text size="xs" c="dimmed" fw={600}>
          {isExpanded ? 'Hide thought process' : 'Thought process'}
        </Text>
      </UnstyledButton>
      <Collapse expanded={isExpanded}>
        <Text className={classes.reasoning} size="sm" c="dimmed">
          {reasoning}
        </Text>
      </Collapse>
    </Stack>
  )
}
