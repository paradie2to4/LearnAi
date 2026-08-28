import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const WEAKEST_TOPICS_LIMIT = 5;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCourseAnalytics(courseId: string, user: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    this.assertOwnerOrAdmin(course.instructorId, user);

    const [enrollments, quizIds] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { courseId } }),
      this.getCourseQuizIds(courseId),
    ]);

    const enrollmentCount = enrollments.length;
    const completionRate =
      enrollmentCount === 0
        ? 0
        : enrollments.filter((e) => e.status === EnrollmentStatus.COMPLETED).length / enrollmentCount;

    const attempts = quizIds.length
      ? await this.prisma.quizAttempt.findMany({
          where: { quizId: { in: quizIds }, status: 'SUBMITTED' },
          select: { score: true, maxScore: true },
        })
      : [];
    const scoredAttempts = attempts.filter((a) => a.maxScore && a.maxScore > 0);
    const averageScore =
      scoredAttempts.length === 0
        ? 0
        : scoredAttempts.reduce((sum, a) => sum + (a.score! / a.maxScore!) * 100, 0) / scoredAttempts.length;

    const questionSuccessRates = await this.getQuestionSuccessRates(quizIds);
    const weakestTopics = await this.getWeakestTopics(
      quizIds,
      enrollments.map((e) => e.userId),
    );

    return {
      courseId,
      enrollmentCount,
      completionRate,
      averageScore,
      questionSuccessRates,
      weakestTopics,
    };
  }

  async getStudentAnalytics(studentId: string, user: AuthenticatedUser) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (user.role === Role.INSTRUCTOR) {
      // An instructor may only view a student they teach (enrolled in one of their courses).
      const sharedEnrollment = await this.prisma.enrollment.findFirst({
        where: { userId: studentId, course: { instructorId: user.userId } },
      });
      if (!sharedEnrollment) {
        throw new ForbiddenException('You do not have permission to view this student');
      }
    } else if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to view this student');
    }

    const [attempts, progress] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { userId: studentId, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, quizId: true, score: true, maxScore: true, passed: true, submittedAt: true },
      }),
      this.prisma.studentProgress.findMany({
        where: { userId: studentId },
        include: { topic: true },
        orderBy: { masteryScore: 'asc' },
      }),
    ]);

    return {
      studentId,
      attempts,
      topicMastery: progress.map((p) => ({
        topicId: p.topicId,
        topicName: p.topic.name,
        masteryScore: p.masteryScore,
        attemptsCount: p.attemptsCount,
      })),
    };
  }

  async getPlatformAnalytics() {
    const [totalStudents, totalInstructors, totalAdmins, totalCourses, totalEnrollments, attempts] =
      await Promise.all([
        this.prisma.user.count({ where: { role: Role.STUDENT } }),
        this.prisma.user.count({ where: { role: Role.INSTRUCTOR } }),
        this.prisma.user.count({ where: { role: Role.ADMIN } }),
        this.prisma.course.count(),
        this.prisma.enrollment.count(),
        this.prisma.quizAttempt.findMany({
          where: { status: 'SUBMITTED' },
          select: { score: true, maxScore: true },
        }),
      ]);

    const scoredAttempts = attempts.filter((a) => a.maxScore && a.maxScore > 0);
    const averageScore =
      scoredAttempts.length === 0
        ? 0
        : scoredAttempts.reduce((sum, a) => sum + (a.score! / a.maxScore!) * 100, 0) / scoredAttempts.length;

    return {
      totalUsers: totalStudents + totalInstructors + totalAdmins,
      totalStudents,
      totalInstructors,
      totalAdmins,
      totalCourses,
      totalEnrollments,
      totalQuizAttempts: attempts.length,
      averageScore,
    };
  }

  private assertOwnerOrAdmin(instructorId: string, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && user.userId !== instructorId) {
      throw new ForbiddenException('You do not have permission to view analytics for this course');
    }
  }

  private async getCourseQuizIds(courseId: string): Promise<string[]> {
    const [direct, viaLesson] = await Promise.all([
      this.prisma.quiz.findMany({ where: { courseId }, select: { id: true } }),
      this.prisma.quiz.findMany({ where: { lesson: { module: { courseId } } }, select: { id: true } }),
    ]);
    return [...new Set([...direct, ...viaLesson].map((q) => q.id))];
  }

  private async getQuestionSuccessRates(
    quizIds: string[],
  ): Promise<{ questionId: string; prompt: string; successRate: number }[]> {
    if (quizIds.length === 0) return [];

    const submissions = await this.prisma.answerSubmission.findMany({
      where: { question: { quizId: { in: quizIds } } },
      select: { questionId: true, isCorrect: true, question: { select: { prompt: true } } },
    });

    const byQuestion = new Map<string, { prompt: string; correct: number; total: number }>();
    for (const submission of submissions) {
      const entry = byQuestion.get(submission.questionId) ?? {
        prompt: submission.question.prompt,
        correct: 0,
        total: 0,
      };
      entry.total += 1;
      if (submission.isCorrect) entry.correct += 1;
      byQuestion.set(submission.questionId, entry);
    }

    return Array.from(byQuestion.entries()).map(([questionId, { prompt, correct, total }]) => ({
      questionId,
      prompt,
      successRate: total === 0 ? 0 : correct / total,
    }));
  }

  private async getWeakestTopics(
    quizIds: string[],
    enrolledUserIds: string[],
  ): Promise<{ topicId: string; topicName: string; averageMastery: number }[]> {
    if (quizIds.length === 0 || enrolledUserIds.length === 0) return [];

    const questions = await this.prisma.question.findMany({
      where: { quizId: { in: quizIds } },
      select: { topicId: true },
      distinct: ['topicId'],
    });
    const topicIds = questions.map((q) => q.topicId);
    if (topicIds.length === 0) return [];

    const progressRows = await this.prisma.studentProgress.findMany({
      where: { topicId: { in: topicIds }, userId: { in: enrolledUserIds } },
      include: { topic: true },
    });

    const byTopic = new Map<string, { topicName: string; sum: number; count: number }>();
    for (const row of progressRows) {
      const entry = byTopic.get(row.topicId) ?? { topicName: row.topic.name, sum: 0, count: 0 };
      entry.sum += row.masteryScore;
      entry.count += 1;
      byTopic.set(row.topicId, entry);
    }

    return Array.from(byTopic.entries())
      .map(([topicId, { topicName, sum, count }]) => ({
        topicId,
        topicName,
        averageMastery: count === 0 ? 0 : sum / count,
      }))
      .sort((a, b) => a.averageMastery - b.averageMastery)
      .slice(0, WEAKEST_TOPICS_LIMIT);
  }
}
