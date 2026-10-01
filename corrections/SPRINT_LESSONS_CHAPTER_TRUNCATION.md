# Chapter Truncation / Fabrication — Lessons Learned

Date: 2026-07-25

## Root Cause

`maxTokens: 8192` in both `src/features/handbook/generator.ts` and
`src/features/quiz/generator.ts` was never an API limit — it was a
self-imposed cap carried over from Sprint 10's initial acceptance criteria
("max_output_tokens: 8192"). The real ceiling for `gemini-2.5-flash` is
65,536. Two things made 8192 fail silently rather than obviously:

- **Thinking tokens share the output budget.** `maxOutputTokens` bounds the
  model's total output, reasoning included — a document that pushes the model
  into a longer internal reasoning trace before it starts writing prose can
  exhaust the 8192 budget on thinking alone, truncating the visible chapter
  mid-sentence with no error, no non-200 status, nothing to distinguish it
  from a successful call. (Same class of bug fixed once already for quizzes
  in Sprint 12 — see `SPRINT_12_LESSONS.md` — but chapter generation kept the
  old ceiling.)
- **No `finishReason` was ever surfaced to calling code.** `GenerateResult`
  only exposed `text`/`tokensUsed`/`keyIndexUsed`/`modelString`; a truncated
  response and a complete one looked identical to every caller. Fixed this
  sprint by adding an optional `finishReason` field, populated from
  `candidates[0].finishReason` in `gemini-provider.ts`.

## The Prompt Defect Ran in Both Directions

`SYSTEM_PROMPT`'s only length instruction was `"Minimalno 3.000 znakova."` — a
floor with no ceiling and no fidelity requirement. That single line produced
two opposite failure modes depending on source size:

- **Large sources → runaway length → truncation.** With no ceiling, the model
  would write until it either finished or hit `maxOutputTokens`. Testing
  (`scripts/test-model.ts`) observed 20K/140K/200K-character outputs on the
  *same* document across runs — wildly unstable — and on the largest real
  documents this instability combined with the 8192 cap to guarantee
  truncation.
- **Tiny sources → the floor forced fabrication.** A document with, say, 550
  characters of real content has nothing close to 3,000 characters worth of
  genuine material — the model filled the gap with invented process
  descriptions, procedures, and figures to hit the floor. Measured case: a
  550-char source (`Pravila Ucionice I IV Razred`) produced a 5,826-char
  chapter — roughly 10x expansion, almost all of it invention. Part A of this
  sprint (`CHAPTER_TRIAGE.md`) found **109 chapters** in this same shape
  (source ≪ chapter, fabricated by construction), only a fraction of which the
  original truncation-regex pass (`TRUNCATED_CHAPTERS.md`, 95 chapters) had
  ever caught — that pass only detected mid-sentence cutoff, which says
  nothing about whether a *complete-sounding* chapter was invented wholesale
  from a thin source.

The fix (`generator.ts` `SYSTEM_PROMPT`) replaces the floor with a target
range (8,000-14,000 chars) gated on actual source richness, an explicit
instruction to preserve every checkable figure/ratio/percentage/deadline/
institution name/article reference, and an explicit ban on padding with
invented content or leaking the generation instructions themselves into the
output (the mechanism behind the separately-flagged `398e9f6d` prompt-leakage
bug, where the model echoed `"minimalnu dužinu od 3.000 znakova"` and signed
off as `"Vaš pisac institucionalnih priručnika"`).

## Fidelity Findings

Comparing the old system prompt against the fixed variant
(`CHAPTER_SYSTEM_PROMPT_FIXED` in `test-model.ts`) on identical source
documents showed the old prompt reliably dropped or paraphrased-away exact
numbers, percentages, deadlines, and article/decision references — the
details that make a policy chapter actually useful and verifiable — while
producing prose that read as fluent and complete. Fluency was never a
reliable signal of fidelity; a chapter can be well-written, non-truncated,
*and* fabricated at the same time, which is exactly what the 109 tiny-source
REGENERATE candidates in Part A demonstrate. The new prompt trades some
proseline concision for a hard "preserve every checkable fact" instruction
specifically to close this gap.

One accepted trade-off: the model still overshoots the stated 8,000-14,000
target range, landing around 17,000-19,000 characters on median-size source
documents. That overshoot is expected and left as-is per this sprint's
scope — the priority was closing the truncation and fabrication failure
modes, not clamping length precisely.

## Methodological Lesson

Early model-comparison testing (before this sprint) ran almost exclusively
against the single ~776K-character outlier document (`Pedagoški standardi i
normativi`) because it was the most dramatic, most visible failure. That
produced a model/prompt ranking that looked clear-cut — and then collapsed
once the same comparison ran against median-size documents (~23,642 chars,
the actual corpus median; 360 of 382 source documents are under 100K chars).
Behavior that holds on a 300x-larger-than-median outlier does not transfer to
the documents that make up the bulk of the corpus. The corrected testing
approach (`test-model.ts`'s `chapterSet=default` mode) deliberately samples a
short/medium/long spread instead of chasing the worst-case document, and any
future model or prompt evaluation on this corpus should keep doing that
rather than optimizing against the single biggest outlier.

## Known Exception (Not a Bug)

`Pedagoški standardi i normativi za odgoj i obrazovanje` (source ~774,695
chars) is expected to still fail — truncate — even at the new 65,536-token
ceiling. No source document at this scale fits any realistic single-call
output budget. `scripts/regenerate-truncated.ts` will log this one as a
validation failure (❌) if it's included in `REGENERATE_LIST.md`; that is
correct behavior, not a regression, and is out of scope for this sprint to
fix further (would require chunked/multi-pass generation, a larger change).

## Commander Improvement Candidates

- **Dopuna A-5 / DL-005 (learned-from, again):** this is the same class of
  bug `SPRINT_12_LESSONS.md` already flagged for quiz generation — maxTokens
  must be dimensioned against the API's real ceiling, not an arbitrarily
  chosen "should be enough" number, and must account for thinking tokens
  sharing the output budget. It recurred here because the fix was applied
  once to the quiz generator and not propagated to the sibling chapter
  generator using the same provider and the same failure shape.
- **Novo pravilo (kandidat, 🔴):** any prompt instruction that sets a
  character/length **floor** for AI-generated content derived from a source
  document must be conditioned on source richness ("only if the source
  supports it"), never absolute — an absolute floor guarantees fabrication on
  thin sources.
- **Dopuna E-5 (learned-from):** "fluent and complete-sounding" is not
  evidence of "faithful to source." Any validation pass over AI-generated
  content that only checks for truncation (ends mid-sentence) will miss
  fabrication (invented content in an otherwise well-formed, complete
  chapter) entirely — the two failure modes need independent checks.
