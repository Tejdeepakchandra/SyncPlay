import { Container } from '@/components/shared/Container'

export function MusicPage() {
  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-music mb-6">
          Music Parties
        </h1>
        <p className="text-secondary">
          Listen to music together with friends.
        </p>
      </div>
    </Container>
  )
}