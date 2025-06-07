import './globals.css'

export const metadata = {
  title: 'File Encryptor/Decryptor',
  description: 'Web interface for XOR-based file encryption and decryption',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}