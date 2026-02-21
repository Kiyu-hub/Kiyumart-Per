import { messageDeliveryService } from "../services/messageDeliveryService";
import { presenceService } from "../services/presenceService";

type Emitted = { room: string; event: string; payload: any };

async function run() {
  const emitted: Emitted[] = [];

  const ioMock = {
    to(room: string) {
      return {
        emit(event: string, payload: any) {
          emitted.push({ room, event, payload });
        },
      };
    },
    emit(_event: string, _payload: any) {},
  } as any;

  presenceService.initialize(ioMock);
  messageDeliveryService.initialize(ioMock);

  // Mark receiver as online so queueMessage attempts immediate delivery.
  presenceService.userConnected("receiver-1", "socket-1");

  const result = await messageDeliveryService.queueMessage({
    id: "msg-1",
    senderId: "sender-1",
    receiverId: "receiver-1",
    message: "hello",
    emitSenderAck: false,
  });

  if (!result.delivered) {
    throw new Error("Expected message to be delivered immediately");
  }

  const receiverEvent = emitted.find((e) => e.room === "receiver-1" && e.event === "new_message");
  if (!receiverEvent) {
    throw new Error("Expected new_message event for receiver");
  }

  const senderAck = emitted.find((e) => e.room === "sender-1" && e.event === "message_sent");
  if (senderAck) {
    throw new Error("Did not expect sender ack when emitSenderAck=false");
  }

  messageDeliveryService.shutdown();
  presenceService.shutdown();

  console.log("✅ message-delivery-service.test passed");
}

run().catch((err) => {
  console.error("❌ message-delivery-service.test failed", err);
  throw err;
});
