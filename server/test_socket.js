const { io } = require("socket.io-client");
const socket = io("http://localhost:5000", { transports: ['websocket'] });

socket.on("connect", () => {
  console.log("Connected:", socket.id);
  socket.emit("room:join", { roomCode: "V94W4E", guestName: "test-bot" }, (joinRes) => {
    console.log("Joined:", joinRes);
    socket.emit("sync:media-change", {
      roomCode: "V94W4E",
      media: { type: "youtube", videoId: "dQw4w9WgXcQ", title: "Rick Astley" }
    }, (res) => {
      console.log("Media Change Res:", res);
      setTimeout(() => process.exit(0), 1000);
    });
  });
});

socket.on("connect_error", (err) => {
  console.error("Connect error:", err);
  process.exit(1);
});
