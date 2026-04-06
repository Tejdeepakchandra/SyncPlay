import { useParams } from "react-router-dom";
import { Container } from "@/components/shared/Container";

export default function MusicRoom() {
  const { roomCode } = useParams();

  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-music mb-4">Music Room: {roomCode}</h1>
        <p className="text-muted-foreground">You're in the music room. Audio player will appear here.</p>
      </div>
    </Container>
  );
}