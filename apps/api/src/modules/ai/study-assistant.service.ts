import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProvider, StudyAssistantMessage } from './ai-provider.interface';
import { AI_PROVIDER } from './ai.constants';

/** Bounds on how much we pull into the context string, to keep the prompt small and the query cheap/bounded. */
const MAX_TOPIC_MASTERY_ROWS = 5;
const MAX_WEAK_TOPICS = 3;
const MAX_GROUNDING_LESSONS = 2;
const LESSON_EXCERPT_MAX_CHARS = 800;

@Injectable()
export class StudyAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  async ask(userId: string, question: string, history: StudyAssistantMessage[]): Promise<{ answer: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const contextSummary = await this.buildContextSummary(userId);

    const answer = await this.aiProvider.answerStudyAssistantQuestion({
      studentFirstName: user.firstName,
      contextSummary,
      history,
      question,
    });

    return { answer };
  }

  /**
   * Compact, bounded context: recent topic mastery, the student's current
   * weakest topics (unresolved WeakTopic rows, worst severity first), and a
   * couple of lesson excerpts drawn from those weak topics — never the whole
   * course catalog.
   */
  private async buildContextSummary(userId: string): Promise<string> {
    const [topicRows, weakTopics] = await Promise.all([
      this.prisma.studentProgress.findMany({
        where: { userId },
        include: { topic: true },
        orderBy: { masteryScore: 'asc' },
        take: MAX_TOPIC_MASTERY_ROWS,
      }),
      this.prisma.weakTopic.findMany({
        where: { userId, resolvedAt: null },
        include: { topic: true },
        orderBy: { severity: 'desc' },
        take: MAX_WEAK_TOPICS,
      }),
    ]);

    const weakTopicIds = weakTopics.map((w) => w.topicId);
    const lessons = weakTopicIds.length
      ? await this.prisma.lesson.findMany({
          where: { topicId: { in: weakTopicIds } },
          select: { title: true, content: true, topicId: true },
          take: MAX_GROUNDING_LESSONS,
        })
      : [];

    const sections: string[] = [];

    if (topicRows.length > 0) {
      sections.push(
        'Topic mastery (lowest first):\n' +
          topicRows.map((row) => `- ${row.topic.name}: ${Math.round(row.masteryScore)}% mastery`).join('\n'),
      );
    } else {
      sections.push('No topic mastery data recorded yet for this student.');
    }

    if (weakTopics.length > 0) {
      sections.push(
        'Current weak topics (most severe first):\n' +
          weakTopics
            .map(
              (w) =>
                `- ${w.topic.name} (severity ${w.severity.toFixed(1)}, mastery ${Math.round(100 - w.severity)}%)`,
            )
            .join('\n'),
      );
    }

    if (lessons.length > 0) {
      sections.push(
        'Relevant lesson excerpts:\n' +
          lessons
            .map((lesson) => `[${lesson.title}]\n${lesson.content.slice(0, LESSON_EXCERPT_MAX_CHARS)}`)
            .join('\n\n'),
      );
    }

    return sections.join('\n\n');
  }
}
