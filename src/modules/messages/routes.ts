import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { parseOrThrow } from "../../utils/validation";
import { createMessageNotification } from "../../utils/notifications";

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

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
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

      const conversation = await tx.conversation.update({
        where: { id: body.conversationId },
        include: {
          ad: { select: { title: true } },
          participants: {
            where: { userId: { not: currentUserId } },
            select: { userId: true },
          },
        },
        data: { updatedAt: new Date() },
      });

      await Promise.all(
        conversation.participants.map((participant) =>
          createMessageNotification(
            {
              recipientId: participant.userId,
              senderName: created.sender.fullName,
              conversationId: body.conversationId,
              adTitle: conversation.ad?.title,
            },
            tx,
          ),
        ),
      );

      return created;
    });

    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
});

export default router;
