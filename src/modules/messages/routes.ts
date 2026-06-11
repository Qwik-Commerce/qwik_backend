import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { parseOrThrow } from "../../utils/validation";
import { createMessageNotification } from "../../utils/notifications";
import { emitConversationUpdated, emitMessageNew, emitNotificationNew } from "../../lib/realtime";

const router = Router();

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  location: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      bio: true,
      avatarUrl: true,
      preferences: true,
    },
  },
} as const;

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const currentUserId = req.auth!.userId;
    const body = parseOrThrow(
      z.object({
        conversationId: z.string().min(1),
        text: z.string().min(1),
      }),
      req.body,
    );

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: body.conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!participant) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: body.conversationId,
        senderId: currentUserId,
        text: body.text.trim(),
      },
      include: {
        sender: {
          select: userSelect,
        },
      },
    });

    const conversation = await prisma.conversation.update({
      where: { id: body.conversationId },
      include: {
        ad: { select: { title: true } },
        participants: {
          select: { userId: true },
        },
      },
      data: { updatedAt: new Date() },
    });

    const participantIds = conversation.participants.map((participant) => participant.userId);
    const recipientIds = participantIds.filter((userId) => userId !== currentUserId);

    void Promise.all(
      recipientIds.map(async (recipientId) => {
        try {
          const notification = await createMessageNotification({
            recipientId,
            senderName: message.sender.fullName,
            conversationId: body.conversationId,
            adTitle: conversation.ad?.title,
          });
          if (notification) emitNotificationNew(recipientId, notification);
        } catch (notificationError) {
          console.error("Failed to create message notification", notificationError);
        }
      }),
    );

    emitMessageNew(body.conversationId, message, recipientIds);
    emitConversationUpdated(
      body.conversationId,
      {
        lastMessage: message,
        lastMessageAt: message.createdAt,
      },
      participantIds,
    );

    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
});

export default router;
