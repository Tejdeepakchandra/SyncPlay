import { Container } from '@/components/shared/Container'

export function MoviePage() {
  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-movie mb-6">
          Movie Rooms
        </h1>
        <p className="text-secondary">
          Watch movies together in perfect sync.
        </p>
      </div>
    </Container>
  )
}