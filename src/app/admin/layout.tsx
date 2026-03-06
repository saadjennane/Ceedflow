export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

export async function generateMetadata() {
  return {
    title: 'Admin - Startup Program',
  }
}
