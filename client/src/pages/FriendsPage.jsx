import { Container } from '@/components/shared/Container'

export function FriendsPage() {
  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-friends mb-6">
          Friends
        </h1>
        <p className="text-secondary">
          Connect with friends and see what they're watching.
        </p>
      </div>
    </Container>
  )
}