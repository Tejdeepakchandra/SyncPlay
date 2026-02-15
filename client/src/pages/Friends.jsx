import { Container } from "@/components/shared/Container";

export default function Friends() {
  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-friends mb-4">Friends</h1>
        <p className="text-muted-foreground">Manage your friends and see what they're watching.</p>
      </div>
    </Container>
  );
}