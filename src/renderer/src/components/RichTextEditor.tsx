import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'

// ── Toolbar button ─────────────────────────────────────────────────────────

function Btn({
  onClick, active = false, title, children,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`titlebar-no-drag px-2 py-1 rounded text-xs transition ${
        active
          ? 'bg-hub-gold/20 text-hub-gold'
          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.07]'
      }`}
    >
      {children}
    </button>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (html: string) => void
  onBlur?: () => void
  placeholder?: string
  minHeight?: string
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Start writing…',
  minHeight = '120px',
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'tiptap', style: `min-height: ${minHeight}` },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onBlur: () => onBlur?.(),
  })

  // Sync external value changes (e.g. when a different task is selected)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false)
    }
  }, [value])  // intentionally omit editor from deps

  if (!editor) return null

  const { state: { selection } } = editor
  const isH1 = editor.isActive('heading', { level: 1 })
  const isH2 = editor.isActive('heading', { level: 2 })
  const isBold = editor.isActive('bold')
  const isItalic = editor.isActive('italic')
  const isBullet = editor.isActive('bulletList')
  const isOrdered = editor.isActive('orderedList')

  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden focus-within:ring-1 focus-within:ring-hub-gold/30 focus-within:border-hub-gold/30 transition">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.06]">
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={isH1} title="Heading 1">
          H1
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={isH2} title="Heading 2">
          H2
        </Btn>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={isBold} title="Bold">
          <strong>B</strong>
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={isItalic} title="Italic">
          <em>I</em>
        </Btn>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={isBullet} title="Bullet list">
          •—
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={isOrdered} title="Numbered list">
          1.
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          "
        </Btn>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo">↩</Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo">↪</Btn>
      </div>

      {/* Content */}
      <div className="titlebar-no-drag px-3 py-2.5">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
