// T6: an AI-suggested topic-tag chip that computes its own 3-state color from props
// and calls thin callbacks. Shared across the Intelligence tabs so News + (later) the
// compose tabs render suggested tags identically.
//
// States (in priority order):
//   1. onArticle          → MUTED + ✓, non-clickable ("Already added")
//   2. !canApply          → muted PURPLE, non-clickable ("Select a project to add tags")
//   3. inLibrary          → GREEN, click → onAttach(tag)  ("Add this tag")
//   4. else (new)         → PURPLE, click → onCreate(tag) ("Create and add this tag")
//
// Same footprint as the old non-clickable spans (px-1.5 py-0.5 rounded text-[10px]
// font-medium) so surrounding layout is unchanged.
import { normalizeTagClient } from './TagPicker'

export interface SuggestedTagChipProps {
  tag: string
  onArticle: boolean          // already on the article's thematic_tags
  inLibrary: boolean          // in the project's known vocabulary
  canApply: boolean           // a project board id exists → create/attach possible
  onAttach: (tag: string) => void
  onCreate: (tag: string) => void
}

const BASE = 'px-1.5 py-0.5 rounded text-[10px] font-medium'

export default function SuggestedTagChip({ tag, onArticle, inLibrary, canApply, onAttach, onCreate }: SuggestedTagChipProps) {
  // Tags are stored NORMALIZED (trim/lowercase/spaces→hyphens). Display + apply the
  // normalized form so the chip's label matches what gets saved and so a just-added
  // mixed-case suggestion flips to the ✓ state. (The onArticle/inLibrary comparisons
  // are normalized in the parent — see NewsTab.)
  const norm = normalizeTagClient(tag)

  // 1. Already on the article — muted, non-clickable, with a checkmark.
  if (onArticle) {
    return (
      <span
        title="Already added"
        className={`${BASE} inline-flex items-center gap-0.5 bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/40 cursor-default`}
      >
        <span aria-hidden>✓</span>{norm}
      </span>
    )
  }

  // 2. No project selected — can't create/attach. Muted purple, non-clickable.
  if (!canApply) {
    return (
      <span
        title="Select a project to add tags"
        className={`${BASE} bg-indigo-50 dark:bg-indigo-500/[0.06] text-indigo-400/70 dark:text-indigo-300/40 cursor-default`}
      >
        {norm}
      </span>
    )
  }

  // 3. In the project library — green, click to attach.
  if (inLibrary) {
    return (
      <button
        type="button"
        onClick={() => onAttach(norm)}
        title="Add this tag"
        className={`${BASE} bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 cursor-pointer transition`}
      >
        {norm}
      </button>
    )
  }

  // 4. Not in library — purple, click to create + attach.
  return (
    <button
      type="button"
      onClick={() => onCreate(norm)}
      title="Create and add this tag"
      className={`${BASE} bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 cursor-pointer transition`}
    >
      + {norm}
    </button>
  )
}
