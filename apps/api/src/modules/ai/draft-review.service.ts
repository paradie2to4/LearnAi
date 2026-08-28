import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DraftStatus, QuestionType, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { toAiDraftQuestionDto } from './ai-draft-mapper.util';

interface OptionsJsonShape {
  options?: { text: string; isCorrect: boolean; order: number }[];
  correctAnswerText?: string;
  acceptableAnswers?: string[];
}

@Injectable()
export class DraftReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** Instructors see only the drafts they requested; ADMIN sees every draft. */
  async listDrafts(user: AuthenticatedUser, status?: DraftStatus) {
    const drafts = await this.prisma.aiGeneratedQuestionDraft.findMany({
      where: {
        ...(user.role === Role.ADMIN ? {} : { requestedById: user.userId }),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return drafts.map((draft) => toAiDraftQuestionDto(draft));
  }

  async approve(id: string, user: AuthenticatedUser) {
    const draft = await this.getDraftOrThrow(id);
    this.assertCanReview(draft, user);

    if ((draft.status as string) !== DraftStatus.PENDING) {
      throw new BadRequestException(`Only PENDING drafts can be approved (current status: ${draft.status})`);
    }

    return this.prisma.aiGeneratedQuestionDraft.update({
      where: { id },
      data: {
        status: DraftStatus.APPROVED,
        reviewedById: user.userId,
        reviewedAt: new Date(),
      },
    });
  }

  /** REJECTED is a terminal state reachable from PENDING or APPROVED (not from an already-PUBLISHED/REJECTED draft). */
  async reject(id: string, user: AuthenticatedUser, reason: string) {
    const draft = await this.getDraftOrThrow(id);
    this.assertCanReview(draft, user);

    const status = draft.status as string;
    if (status !== DraftStatus.PENDING && status !== DraftStatus.APPROVED) {
      throw new BadRequestException(`Cannot reject a draft with status ${draft.status}`);
    }

    return this.prisma.aiGeneratedQuestionDraft.update({
      where: { id },
      data: {
        status: DraftStatus.REJECTED,
        reviewedById: user.userId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

  /**
   * Publishing rule (documented deviation/clarification from the brief):
   * both PENDING and APPROVED drafts may be published. APPROVED is the
   * expected two-step review flow; PENDING is also allowed so a single
   * instructor can go straight from "generate" to "publish" in one click for
   * their own drafts without a separate approve step. Only PUBLISHED or
   * REJECTED drafts are refused (no re-publishing).
   */
  async publish(id: string, user: AuthenticatedUser) {
    const draft = await this.getDraftOrThrow(id);
    this.assertCanReview(draft, user);

    const status = draft.status as string;
    if (status !== DraftStatus.PENDING && status !== DraftStatus.APPROVED) {
      throw new BadRequestException(
        `Only PENDING or APPROVED drafts can be published (current status: ${draft.status})`,
      );
    }
    if (!draft.quizId) {
      throw new BadRequestException('This draft has no quizId set; attach it to a quiz before publishing');
    }
    const quizId = draft.quizId;

    return this.prisma.$transaction(async (tx) => {
      const questionCount = await tx.question.count({ where: { quizId } });
      const optionsJson = (draft.optionsJson ?? {}) as OptionsJsonShape;
      const isShortAnswer = (draft.type as string) === QuestionType.SHORT_ANSWER;

      const question = await tx.question.create({
        data: {
          quizId,
          topicId: draft.topicId,
          type: draft.type,
          prompt: draft.prompt,
          order: questionCount,
          explanation: draft.explanation,
          correctAnswerText: isShortAnswer ? (optionsJson.correctAnswerText ?? null) : null,
          acceptableAnswers: isShortAnswer ? (optionsJson.acceptableAnswers ?? []) : [],
          options:
            !isShortAnswer && optionsJson.options && optionsJson.options.length > 0
              ? {
                  create: optionsJson.options.map((option) => ({
                    text: option.text,
                    isCorrect: option.isCorrect,
                    order: option.order,
                  })),
                }
              : undefined,
        },
        include: { options: true },
      });

      await tx.aiGeneratedQuestionDraft.update({
        where: { id },
        data: {
          status: DraftStatus.PUBLISHED,
          publishedQuestionId: question.id,
          reviewedById: user.userId,
          reviewedAt: draft.reviewedAt ?? new Date(),
        },
      });

      return question;
    });
  }

  private async getDraftOrThrow(id: string) {
    const draft = await this.prisma.aiGeneratedQuestionDraft.findUnique({ where: { id } });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    return draft;
  }

  /** Only the requesting instructor or an ADMIN may review/publish a draft. */
  private assertCanReview(draft: { requestedById: string }, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && draft.requestedById !== user.userId) {
      throw new ForbiddenException('You do not have permission to review this draft');
    }
  }
}
