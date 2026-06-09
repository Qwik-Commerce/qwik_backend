"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessageNotification = createMessageNotification;
const prisma_1 = require("../lib/prisma");
async function createMessageNotification(input, client = prisma_1.prisma) {
    const settings = await client.notificationSettings.findUnique({
        where: { userId: input.recipientId },
        select: { messageNotifications: true },
    });
    if (settings && !settings.messageNotifications)
        return null;
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
