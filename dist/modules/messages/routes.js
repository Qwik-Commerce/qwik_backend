"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validation_1 = require("../../utils/validation");
const notifications_1 = require("../../utils/notifications");
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
        const message = await prisma_1.prisma.$transaction(async (tx) => {
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
            await Promise.all(conversation.participants.map((participant) => (0, notifications_1.createMessageNotification)({
                recipientId: participant.userId,
                senderName: created.sender.fullName,
                conversationId: body.conversationId,
                adTitle: conversation.ad?.title,
            }, tx)));
            return created;
        });
        res.status(201).json({ success: true, data: message });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
