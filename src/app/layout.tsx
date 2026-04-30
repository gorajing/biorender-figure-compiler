import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BioRender Figure Compiler',
  description:
    'A renderer-aware Figure Intent Layer that compiles paper abstracts ' +
    'into editable, validated FigureSpec JSON for BioRender canvases.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
