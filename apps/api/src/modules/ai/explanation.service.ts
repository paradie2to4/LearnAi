import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionType } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProvider } from './ai-provider.interface';
import { AI_PROVIDER } from './ai.constants';

/** Friendly short-circuit for a submission that was actually correct — no need to spend an AI call explaining a right answer. */
const ALREADY_CORRECT_MESSAGE =
  "You got this one right! Nice work — no correction needed here, but feel free to review the explanation on the question if you'd like a refresher.";

@Injectable()
export class ExplanationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  /**
   * A student might still want an AI explanation for a submission that was
   * actually graded correct (e.g. they guessed, or want reassurance). Rather
   * than calling the AI provider for that case, we short-circuit with a
   * friendly canned message — cheaper and avoids asking the model to explain
   * "wrongness" that doesn't exist.
   */
  async explainAnswer(userId: string, answerSubmissionId: string): Promise<{ explanation: string }> {
    const submission = await this.prisma.answerSubmission.findUnique({
      where: { id: answerSubmissionId },
      include: {
        attempt: true,
        question: { include: { options: { orderBy: { order: 'asc' } } } },
      },
    });
    if (!submission) {
      throw new NotFoundException('Answer submission not found');
    }
    if (submission.attempt.userId !== userId) {
      throw new ForbiddenException('You do not have access to this answer submission');
    }

    if (submission.isCorrect) {
      return { explanation: ALREADY_CORRECT_MESSAGE };
    }

    const question = submission.question;
    const isShortAnswer = (question.type as string) === QuestionType.SHORT_ANSWER;

    const options = question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect }));

    const selectedAnswerText = isShortAnswer
      ? (submission.answerText ?? '(no answer given)')
      : this.describeSelectedOptions(question.options, submission.selectedOptionIds);

    const correctAnswerText = isShortAnswer
      ? (question.correctAnswerText ?? '(no reference answer configured)')
      : this.describeCorrectOptions(question.options);

    const explanation = await this.aiProvider.explainIncorrectAnswer({
      questionPrompt: question.prompt,
      options,
      selectedAnswerText,
      correctAnswerText,
      existingExplanation: question.explanation,
    });

    return { explanation };
  }

  private describeSelectedOptions(
    options: { id: string; text: string }[],
    selectedOptionIds: string[],
  ): string {
    if (selectedOptionIds.length === 0) {
      return '(no answer given)';
    }
    const byId = new Map(options.map((o) => [o.id, o.text]));
    return selectedOptionIds.map((id) => byId.get(id) ?? '(unknown option)').join(', ');
  }

  private describeCorrectOptions(options: { text: string; isCorrect: boolean }[]): string {
    const correct = options.filter((o) => o.isCorrect).map((o) => o.text);
    return correct.length > 0 ? correct.join(', ') : '(no correct option configured)';
  }
}
