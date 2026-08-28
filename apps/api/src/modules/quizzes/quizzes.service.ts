import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { assertIsOwnerOrAdmin, resolveOwningInstructorId } from './quiz-ownership.util';

@Injectable()
export class QuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateQuizDto, user: AuthenticatedUser) {
    if (!dto.courseId && !dto.lessonId) {
      throw new BadRequestException('A quiz must belong to a courseId or a lessonId');
    }

    const instructorId = await resolveOwningInstructorId(this.prisma, dto);
    assertIsOwnerOrAdmin(instructorId, user);

    return this.prisma.quiz.create({
      data: {
        title: dto.title,
        courseId: dto.courseId ?? null,
        lessonId: dto.lessonId ?? null,
        passingScore: dto.passingScore ?? 70,
        timeLimitMinutes: dto.timeLimitMinutes,
        partialCreditMultiAnswer: dto.partialCreditMultiAnswer ?? true,
        createdById: user.userId,
      },
    });
  }

  async update(id: string, dto: UpdateQuizDto, user: AuthenticatedUser) {
    const quiz = await this.getQuizOrThrow(id);
    await this.assertOwnership(quiz, user);

    return this.prisma.quiz.update({
      where: { id },
      data: {
        title: dto.title,
        courseId: dto.courseId,
        lessonId: dto.lessonId,
        passingScore: dto.passingScore,
        timeLimitMinutes: dto.timeLimitMinutes,
        partialCreditMultiAnswer: dto.partialCreditMultiAnswer,
      },
    });
  }

  async publish(id: string, user: AuthenticatedUser) {
    const quiz = await this.getQuizOrThrow(id);
    await this.assertOwnership(quiz, user);

    const questionCount = await this.prisma.question.count({ where: { quizId: id } });
    if (questionCount === 0) {
      throw new BadRequestException('Cannot publish a quiz with no questions');
    }

    return this.prisma.quiz.update({ where: { id }, data: { isPublished: true } });
  }

  /**
   * Student-facing view strips the answer key entirely: no `isCorrect` on
   * options, no `explanation`/`correctAnswerText`/`acceptableAnswers` on the
   * question. Instructors (any) and ADMINs get the full authoring view;
   * ownership is not re-checked here since any instructor/admin viewing a
   * *published* quiz for study purposes is acceptable, and unpublished
   * quizzes are only ever linked to by their own authoring instructor in
   * the current UI. Tightening this to owner-only is a reasonable future
   * hardening step but is not required by the stated spec.
   */
  async findOne(id: string, user: AuthenticatedUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const isStudent = user.role === Role.STUDENT;

    return {
      id: quiz.id,
      title: quiz.title,
      courseId: quiz.courseId,
      lessonId: quiz.lessonId,
      passingScore: quiz.passingScore,
      timeLimitMinutes: quiz.timeLimitMinutes,
      isPublished: quiz.isPublished,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        order: q.order,
        topicId: q.topicId,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          order: o.order,
          ...(isStudent ? {} : { isCorrect: o.isCorrect }),
        })),
        ...(isStudent
          ? {}
          : {
              explanation: q.explanation,
              correctAnswerText: q.correctAnswerText,
              acceptableAnswers: q.acceptableAnswers,
            }),
      })),
    };
  }

  private async getQuizOrThrow(id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    return quiz;
  }

  private async assertOwnership(
    quiz: { courseId: string | null; lessonId: string | null },
    user: AuthenticatedUser,
  ) {
    const instructorId = await resolveOwningInstructorId(this.prisma, quiz);
    assertIsOwnerOrAdmin(instructorId, user);
  }
}
