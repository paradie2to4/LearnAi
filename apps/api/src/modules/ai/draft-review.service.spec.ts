import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, QuestionType, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { DraftReviewService } from './draft-review.service';

describe('DraftReviewService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: DraftReviewService;

  const requester = { userId: 'instructor-1', email: 'i@example.com', role: Role.INSTRUCTOR };
  const otherInstructor = { userId: 'instructor-2', email: 'other@example.com', role: Role.INSTRUCTOR };
  const admin = { userId: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };

  const pendingDraft = {
    id: 'draft-1',
    quizId: 'quiz-1',
    topicId: 'topic-1',
    requestedById: requester.userId,
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: 'What is 2+2?',
    optionsJson: {
      options: [
        { text: '3', isCorrect: false, order: 0 },
        { text: '4', isCorrect: true, order: 1 },
      ],
    },
    explanation: 'Basic arithmetic',
    status: DraftStatus.PENDING,
    reviewedById: null,
    reviewedAt: null,
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new DraftReviewService(prisma);
  });

  describe('approve', () => {
    it('denies a reviewer who is neither the requester nor an ADMIN', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue(pendingDraft as any);

      await expect(service.approve(pendingDraft.id, otherInstructor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows the requesting instructor to approve a PENDING draft', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue(pendingDraft as any);
      prisma.aiGeneratedQuestionDraft.update.mockResolvedValue({
        ...pendingDraft,
        status: DraftStatus.APPROVED,
      } as any);

      await service.approve(pendingDraft.id, requester);

      expect(prisma.aiGeneratedQuestionDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: DraftStatus.APPROVED }) }),
      );
    });

    it('rejects approving a draft that is not PENDING', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue({
        ...pendingDraft,
        status: DraftStatus.PUBLISHED,
      } as any);

      await expect(service.approve(pendingDraft.id, requester)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for a missing draft', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue(null);

      await expect(service.approve('missing', requester)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish', () => {
    it('requires quizId to be set', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue({ ...pendingDraft, quizId: null } as any);

      await expect(service.publish(pendingDraft.id, requester)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to re-publish an already PUBLISHED draft', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue({
        ...pendingDraft,
        status: DraftStatus.PUBLISHED,
      } as any);

      await expect(service.publish(pendingDraft.id, requester)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to publish a REJECTED draft', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue({
        ...pendingDraft,
        status: DraftStatus.REJECTED,
      } as any);

      await expect(service.publish(pendingDraft.id, requester)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a Question+Options and stamps publishedQuestionId transactionally', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue(pendingDraft as any);
      const createdQuestion = { id: 'question-1', options: [] };
      const tx = {
        question: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue(createdQuestion),
        },
        aiGeneratedQuestionDraft: {
          update: jest.fn().mockResolvedValue({ ...pendingDraft, status: DraftStatus.PUBLISHED }),
        },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await service.publish(pendingDraft.id, admin);

      expect(result).toEqual(createdQuestion);
      expect(tx.question.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quizId: pendingDraft.quizId,
            topicId: pendingDraft.topicId,
            type: pendingDraft.type,
          }),
        }),
      );
      expect(tx.aiGeneratedQuestionDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DraftStatus.PUBLISHED, publishedQuestionId: 'question-1' }),
        }),
      );
    });
  });

  describe('reject', () => {
    it('sets status to REJECTED with the given reason', async () => {
      prisma.aiGeneratedQuestionDraft.findUnique.mockResolvedValue(pendingDraft as any);
      prisma.aiGeneratedQuestionDraft.update.mockResolvedValue({
        ...pendingDraft,
        status: DraftStatus.REJECTED,
      } as any);

      await service.reject(pendingDraft.id, requester, 'Too easy');

      expect(prisma.aiGeneratedQuestionDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DraftStatus.REJECTED, rejectionReason: 'Too easy' }),
        }),
      );
    });
  });
});
