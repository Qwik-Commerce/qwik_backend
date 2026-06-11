"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validation_1 = require("../../utils/validation");
const notifications_1 = require("../../utils/notifications");
const realtime_1 = require("../../lib/realtime");
const router = (0, express_1.Router)();
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
};
router.post("/", auth_1.requireAuth, async (req, res, next) => {
    try {
        const currentUserId = req.auth.userId;
        const body = (0, validation_1.parseOrThrow)(zod_1.z.object({
            conversationId: zod_1.z.string().min(1),
            text: zod_1.z.string().min(1),
        }), req.body);
        const participant = await prisma_1.prisma.conversationParticipant.findUnique({
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
        const message = await prisma_1.prisma.message.create({
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
        const conversation = await prisma_1.prisma.conversation.update({
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
        void Promise.all(recipientIds.map(async (recipientId) => {
            try {
                const notification = await (0, notifications_1.createMessageNotification)({
                    recipientId,
                    senderName: message.sender.fullName,
                    conversationId: body.conversationId,
                    adTitle: conversation.ad?.title,
                });
                if (notification)
                    (0, realtime_1.emitNotificationNew)(recipientId, notification);
            }
            catch (notificationError) {
                console.error("Failed to create message notification", notificationError);
            }
        }));
        (0, realtime_1.emitMessageNew)(body.conversationId, message, recipientIds);
        (0, realtime_1.emitConversationUpdated)(body.conversationId, {
            lastMessage: message,
            lastMessageAt: message.createdAt,
        }, participantIds);
        res.status(201).json({ success: true, data: message });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
