import { Badge, Tooltip } from '@mantine/core'
import { useStatus } from '@powersync/react'

import classes from './SyncStatusIndicator.module.css'

function describe(status: ReturnType<typeof useStatus>) {
  if (status.connected) {
    return { label: 'Synced', colour: 'teal' as const }
  }

  // A failed attempt leaves the SDK retrying, so `connecting` stays true for as
  // long as the service is unreachable. Reporting that as "connecting" would
  // read as a slow start rather than as offline, which is the state this badge
  // exists to make visible.
  const isUnreachable = status.dataFlowStatus.downloadError !== undefined

  if (status.connecting && !isUnreachable) {
    return { label: 'Connecting', colour: 'yellow' as const }
  }

  return { label: 'Offline', colour: 'gray' as const }
}

/**
 * Whether this device is currently replicating.
 *
 * Not decoration. The claim being demonstrated is about what still works when
 * the network is gone, and an offline state nobody can see makes that claim
 * unfalsifiable — the thread list would look identical whether Sync had served
 * it from local SQLite or never connected at all.
 */
export function SyncStatusIndicator() {
  const status = useStatus()
  const { label, colour } = describe(status)
  const lastSyncedAt = status.lastSyncedAt

  return (
    <Tooltip
      label={
        lastSyncedAt === undefined
          ? 'This device has not synced yet.'
          : `Last synced ${lastSyncedAt.toLocaleTimeString()}`
      }
    >
      <Badge className={classes.root} color={colour} variant="light" size="sm">
        {label}
      </Badge>
    </Tooltip>
  )
}
