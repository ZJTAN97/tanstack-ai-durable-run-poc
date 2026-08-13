import type { ModelMessage } from '@tanstack/ai'
import { z } from 'zod'

/**
 * What a stored message must look like to be a `ModelMessage`.
 *
 * `chat_messages.message` is a `jsonb` column declared `$type<ModelMessage>()`,
 * and that declaration is a compile-time assertion with nothing behind it. Rows
 * outlive the code that wrote them: one written by an earlier shape of this
 * schema, edited by hand in `db:studio`, or produced by a since-upgraded library
 * reads back as a confidently-typed value that nothing has checked. This is the
 * schema that checks it, at the one boundary where the transcript re-enters the
 * program.
 *
 * Two decisions shape the rest of the file.
 *
 * **Every object is loose, never `z.object`.** A `z.object` STRIPS keys it does
 * not declare, and a save is a full overwrite of the transcript that was
 * loaded — so a key stripped on the way out is permanently deleted on the next
 * turn. That failure is silent and unrecoverable, which makes it strictly worse
 * than the unchecked cast this replaces. Loose objects keep provider-specific
 * and future fields intact while still requiring the ones the contract names.
 *
 * **Part types are a closed union, deliberately.** Accepting an unrecognised
 * `part.type` would mean calling a message valid on the way to the client
 * without knowing what is in it, and would defeat the point of parsing. The
 * cost is that a new modality in `@tanstack/ai` must be added here — but the
 * `ModelMessage` annotation below turns that into a build failure the moment
 * the library is upgraded, which is well before any such row could exist.
 */

// `metadata` is provider-specific and read by nobody here, so it is carried
// rather than described. Every part type shares it.
const partMetadataSchema = z.unknown().optional()

const contentPartSourceSchema = z.discriminatedUnion('type', [
  // A data source must say what it is: base64 bytes with no mime type are not
  // something a provider can be handed.
  z.looseObject({
    type: z.literal('data'),
    value: z.string(),
    mimeType: z.string(),
  }),
  // A URL source may omit it, because the fetch can reveal it.
  z.looseObject({
    type: z.literal('url'),
    value: z.string(),
    mimeType: z.string().optional(),
  }),
])

// The four non-text modalities differ only in their discriminant. Generic so
// each call keeps its literal type, which is what `discriminatedUnion` needs.
function mediaContentPartSchema<
  TModality extends 'image' | 'audio' | 'video' | 'document',
>(modality: TModality) {
  return z.looseObject({
    type: z.literal(modality),
    source: contentPartSourceSchema,
    metadata: partMetadataSchema,
  })
}

const contentPartSchema = z.discriminatedUnion('type', [
  // `content` is required as a string because the title derivation reads it
  // directly — a text part without one is not merely odd, it is unusable.
  z.looseObject({
    type: z.literal('text'),
    content: z.string(),
    metadata: partMetadataSchema,
  }),
  mediaContentPartSchema('image'),
  mediaContentPartSchema('audio'),
  mediaContentPartSchema('video'),
  mediaContentPartSchema('document'),
])

const toolCallSchema = z.looseObject({
  id: z.string(),
  type: z.literal('function'),
  function: z.looseObject({ name: z.string(), arguments: z.string() }),
  metadata: partMetadataSchema,
})

/**
 * Annotated rather than inferred, against this codebase's usual rule, because
 * the annotation is the point: it is a compile-time claim that this schema
 * produces exactly what `@tanstack/ai` means by a message. Drop it and the
 * schema is free to drift from the library — silently accepting a shape the
 * rest of the program no longer expects, which is the class of bug this file
 * exists to close.
 *
 * `null` content is a real value, distinct from absent: a tool-call turn
 * carries its calls in `toolCalls` and has nothing to say in `content`.
 */
export const modelMessageSchema: z.ZodType<ModelMessage> = z.looseObject({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.union([z.string(), z.null(), z.array(contentPartSchema)]),
  name: z.string().optional(),
  toolCalls: z.array(toolCallSchema).optional(),
  toolCallId: z.string().optional(),
  thinking: z
    .array(
      z.looseObject({ content: z.string(), signature: z.string().optional() }),
    )
    .optional(),
  id: z.string().optional(),
})
