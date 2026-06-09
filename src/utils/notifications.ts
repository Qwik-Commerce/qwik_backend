import type { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";

type NotificationClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

type MessageNotificationInput = {
  recipientId: string;
  senderName: string;
  conversationId: string;
  adTitle?: string | null;
};

export async function createMessageNotification(
  input: MessageNotificationInput,
  client: NotificationClient = prisma,
) {
  const settings = await client.notificationSettings.findUnique({
    where: { userId: input.recipientId },
    select: { messageNotifications: true },
  });

  if (settings && !settings.messageNotifications) return null;

  const subject = input.adTitle ? ` about ${input.adTitle}` : "";
  return client.notification.create({
    data: {
      userId: input.recipientId,
      type: "message",
      title: "New message",
      body: `${input.senderName} sent you a new message${subject}.`,
      actionUrl: `/messages?conversation=${input.conversationId}`,
      data: {
        conversationId: input.conversationId,
      },
    },
  });
}
