/**
 * A prompt whose reply is long enough to reload in the middle of, on purpose.
 *
 * The mid-stream reload is the behaviour the POC exists to demonstrate, and it
 * can only be demonstrated if the window to reload in is wide and the same
 * every time. Typing a question quickly and hoping the reply is still streaming
 * when the reload lands is not a test.
 *
 * The instructions fight the two things that would narrow the window: a model
 * that answers tersely, and one that decides partway through that the
 * repetition is pointless.
 */
export const LONG_RUN_PRESET_PROMPT = `Count from 1 to 150.

Put each number on its own line, written first as digits and then as words — for example "7 — seven". Add nothing else: no preamble, no commentary, no summary at the end.

Do not stop early, do not skip ahead, and do not abbreviate the middle. Go all the way to 150.`
