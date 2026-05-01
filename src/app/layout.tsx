import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BioRender Figure Compiler',
  description:
    'A source-grounded FigureSpec compiler that turns paper text into an ' +
    'editor-ready BioRender draft, with provenance and validation before ' +
    'anything reaches the canvas.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
