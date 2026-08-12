import { z } from 'zod'

/**
 * The offsets that name a position without naming a run: replay everything, or
 * attach at the current tail. Every other offset is minted by the durability
 * backend and carries its own run identity.
 */
const FROM_START_OFFSET = '-1'
const FROM_TAIL_OFFSET = 'now'

const runIdentifier = z
  .string()
  .min(1)
  .refine((value) => !/[\r\n]/.test(value), {
    error: 'must not contain a line break',
  })

/**
 * What a request resuming a run must carry.
 *
 * A resume must be able to say *which* run it wants. A backend-minted offset
 * already encodes that, so it stands alone; the two positional offsets do not,
 * so they need an explicit run id beside them. Without this check a positional
 * resume naming no run is indistinguishable from a brand new one, and the
 * request goes on to wait out a deadline against a run that never existed
 * instead of being turned away immediately.
 *
 * A resume carrying no offset at all is rejected downstream, by the transport
 * that owns the offset format — there is nothing to replay from.
 */
export const resumeRunRequestSchema = z
  .object({
    runId: runIdentifier.nullable(),
    offset: z.string().min(1).nullable(),
  })
  .refine(
    ({ runId, offset }) => {
      const offsetNamesItsOwnRun =
        offset !== null &&
        offset !== FROM_START_OFFSET &&
        offset !== FROM_TAIL_OFFSET

      return runId !== null || offsetNamesItsOwnRun
    },
    {
      error:
        'a resume must name a run: send runId (or an X-Run-Id header) alongside a positional offset',
    },
  )
