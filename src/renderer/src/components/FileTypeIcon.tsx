export interface FileIconProps { name: string; type: string }

export function FileTypeIcon({ name, type }: FileIconProps) {
  const lname = name.toLowerCase()

  if (type === 'url') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-400 dark:text-white/40 shrink-0">
      <path d="M7 11l2-2M11 7l-2 2M6 9a3 3 0 0 0 0 4.24L7.76 15A3 3 0 0 0 12 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M12 9a3 3 0 0 0 0-4.24L10.24 3A3 3 0 0 0 6 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
  if (type === 'gdoc') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-blue-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
  if (lname.endsWith('.pdf')) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-red-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 8h2.5a1 1 0 0 1 0 2H6V8z" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M10 8v4M12 8v2.5a1 1 0 0 1-2 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
  if (lname.match(/\.(doc|docx)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-blue-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
  if (lname.match(/\.(xls|xlsx|csv)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-green-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 6h6M6 9h6M6 12h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M10 1v6M3 7h12" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
  if (lname.match(/\.(ppt|pptx)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-orange-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6" y="5" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
  if (lname.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-purple-500 shrink-0">
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M2 13l4-3.5 3 2.5 2.5-2 4.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-400 dark:text-white/40 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}

export function LargeFileIcon({ name, type }: FileIconProps) {
  const lname = name.toLowerCase()
  if (type === 'url') return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-gray-400 dark:text-white/35">
      <path d="M11 17l3-3M17 11l-3 3M9 14a4.5 4.5 0 0 0 0 6.36L11.64 23A4.5 4.5 0 0 0 18 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M19 14a4.5 4.5 0 0 0 0-6.36L16.36 5A4.5 4.5 0 0 0 10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (lname.endsWith('.pdf')) return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-red-500">
      <rect x="4" y="2" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 13h3.5a1.5 1.5 0 0 1 0 3H9v-3z" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
  if (lname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-purple-500">
      <rect x="3" y="4" width="22" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3 20l6-5 5 4 4-3 7 6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-gray-400 dark:text-white/35">
      <rect x="4" y="2" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 10h10M9 14h10M9 18h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export default FileTypeIcon
