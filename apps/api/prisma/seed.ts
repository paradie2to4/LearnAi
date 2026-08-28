/**
 * Database seed script for local development and demos.
 *
 * Run via `npm run prisma:seed -w apps/api` (invokes `ts-node prisma/seed.ts`,
 * see apps/api/package.json). Uses PrismaClient directly rather than booting the
 * Nest application, since it only needs data-access, not HTTP/DI wiring.
 *
 * Safe to re-run: models with a natural unique key (User.email, Subject.name,
 * Topic (subjectId, name), Module (courseId, order), Lesson (moduleId, order))
 * use `upsert`. Models without a schema-level unique constraint (Course, Quiz,
 * Question, QuestionOption) use an explicit find-or-create helper keyed on a
 * stable natural identifier, so re-running the script does not create duplicate
 * rows or crash on an implicit unique violation.
 */
import { PrismaClient, Role, QuestionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;
const DEMO_PASSWORD = 'Passw0rd!';

async function findOrCreate<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const existing = await find();
  if (existing) return existing;
  return create();
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@learnai.dev' },
    update: {},
    create: {
      email: 'admin@learnai.dev',
      passwordHash,
      firstName: 'Ada',
      lastName: 'Administrator',
      role: Role.ADMIN,
    },
  });

  const instructor = await prisma.user.upsert({
    where: { email: 'instructor@learnai.dev' },
    update: {},
    create: {
      email: 'instructor@learnai.dev',
      passwordHash,
      firstName: 'Ian',
      lastName: 'Instructor',
      role: Role.INSTRUCTOR,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@learnai.dev' },
    update: {},
    create: {
      email: 'student@learnai.dev',
      passwordHash,
      firstName: 'Sam',
      lastName: 'Student',
      role: Role.STUDENT,
    },
  });

  return { admin, instructor, student };
}

async function seedTaxonomy() {
  const subject = await prisma.subject.upsert({
    where: { name: 'Computer Science' },
    update: {},
    create: {
      name: 'Computer Science',
      description:
        'Foundational computer science topics, starting with relational database design and SQL.',
    },
  });

  const topicNames = [
    'Database Fundamentals',
    'SQL Joins',
    'Normalization',
    'Transactions',
    'Indexing',
  ];

  const topics: Record<string, Awaited<ReturnType<typeof prisma.topic.upsert>>> = {};
  for (const name of topicNames) {
    topics[name] = await prisma.topic.upsert({
      where: { subjectId_name: { subjectId: subject.id, name } },
      update: {},
      create: { name, subjectId: subject.id },
    });
  }

  return { subject, topics };
}

async function seedCourse(
  instructorId: string,
  subjectId: string,
  topics: Record<string, { id: string }>,
) {
  const course = await findOrCreate(
    () =>
      prisma.course.findFirst({
        where: { instructorId, title: 'Database Systems Fundamentals' },
      }),
    () =>
      prisma.course.create({
        data: {
          title: 'Database Systems Fundamentals',
          description:
            'An introduction to relational database design, SQL querying, and the transactional guarantees that keep data correct — the running example used throughout this platform for knowledge-gap detection.',
          subjectId,
          instructorId,
          isPublished: true,
        },
      }),
  );

  const module1 = await prisma.module.upsert({
    where: { courseId_order: { courseId: course.id, order: 1 } },
    update: {},
    create: { courseId: course.id, title: 'Module 1: Relational Foundations', order: 1 },
  });

  const module2 = await prisma.module.upsert({
    where: { courseId_order: { courseId: course.id, order: 2 } },
    update: {},
    create: { courseId: course.id, title: 'Module 2: Integrity & Performance', order: 2 },
  });

  await prisma.lesson.upsert({
    where: { moduleId_order: { moduleId: module1.id, order: 1 } },
    update: {},
    create: {
      moduleId: module1.id,
      title: 'What Is a Relational Database?',
      order: 1,
      topicId: topics['Database Fundamentals'].id,
      estimatedMinutes: 12,
      content: `## What Is a Relational Database?

A relational database organizes data into **tables** made up of rows and columns.
Each row represents one record; each column represents one attribute of that
record. Tables relate to one another through shared key values rather than by
nesting data inside a single document.

Two ideas make this model powerful:

- **Primary key** — a column (or set of columns) that uniquely identifies each
  row in a table. No two rows may share the same primary key value.
- **Foreign key** — a column in one table that references the primary key of
  another table, expressing a relationship between the two (e.g. an
  \`enrollments.student_id\` column referencing \`students.id\`).

Because relationships are expressed through keys rather than physical nesting,
the same underlying data can be queried, joined, and reshaped in many
different ways without duplicating it.`,
    },
  });

  await prisma.lesson.upsert({
    where: { moduleId_order: { moduleId: module1.id, order: 2 } },
    update: {},
    create: {
      moduleId: module1.id,
      title: 'Mastering SQL Joins',
      order: 2,
      topicId: topics['SQL Joins'].id,
      estimatedMinutes: 18,
      content: `## Mastering SQL Joins

A **join** combines rows from two or more tables based on a related column.

- **INNER JOIN** returns only the rows that have matching values in both
  tables. Rows without a match on either side are dropped.
- **LEFT JOIN** returns every row from the left table, plus matching rows from
  the right table. Where there's no match, the right-hand columns are \`NULL\`.
- **RIGHT JOIN** is the mirror image of \`LEFT JOIN\`.
- **CROSS JOIN** returns the Cartesian product of both tables — every row from
  the first table paired with every row from the second.

Choosing the right join type is a matter of asking: "do I want to keep rows
that have no match on the other side, and if so, from which table?"`,
    },
  });

  await prisma.lesson.upsert({
    where: { moduleId_order: { moduleId: module2.id, order: 1 } },
    update: {},
    create: {
      moduleId: module2.id,
      title: 'Normalizing Your Schema',
      order: 1,
      topicId: topics['Normalization'].id,
      estimatedMinutes: 20,
      content: `## Normalizing Your Schema

**Normalization** is the process of structuring tables to reduce redundancy
and avoid update, insertion, and deletion anomalies.

- **1NF** — every column holds a single, atomic value (no repeating groups).
- **2NF** — every non-key attribute depends on the *whole* primary key, not
  just part of it (relevant when the key is composite).
- **3NF** — every non-key attribute depends *only* on the key — "the key, the
  whole key, and nothing but the key" — with no transitive dependencies on
  other non-key attributes.

Normalization trades some query-time convenience (more joins) for a schema
where each fact is stored exactly once, which keeps the data consistent as it
changes.`,
    },
  });

  await prisma.lesson.upsert({
    where: { moduleId_order: { moduleId: module2.id, order: 2 } },
    update: {},
    create: {
      moduleId: module2.id,
      title: 'Transactions and the ACID Guarantees',
      order: 2,
      topicId: topics['Transactions'].id,
      estimatedMinutes: 15,
      content: `## Transactions and the ACID Guarantees

A **transaction** groups one or more statements into a single unit of work
that either fully succeeds or fully fails. Relational databases guarantee this
through four properties, known by the acronym **ACID**:

- **Atomicity** — the transaction happens completely, or not at all.
- **Consistency** — a transaction moves the database from one valid state to
  another, respecting all constraints.
- **Isolation** — concurrent transactions don't see each other's uncommitted
  changes.
- **Durability** — once committed, a transaction's changes survive a crash.

These guarantees are what let an application safely perform multi-step
operations — like transferring funds between two accounts — without worrying
about partial writes.`,
    },
  });

  return { course, module1, module2 };
}

async function seedQuiz(
  courseId: string,
  createdById: string,
  topics: Record<string, { id: string }>,
) {
  const quiz = await findOrCreate(
    () => prisma.quiz.findFirst({ where: { courseId, title: 'Database Systems Fundamentals Quiz' } }),
    () =>
      prisma.quiz.create({
        data: {
          title: 'Database Systems Fundamentals Quiz',
          courseId,
          passingScore: 70,
          timeLimitMinutes: 20,
          isPublished: true,
          partialCreditMultiAnswer: true,
          createdById,
        },
      }),
  );

  type QuestionSeed = {
    order: number;
    type: QuestionType;
    topicId: string;
    prompt: string;
    explanation: string;
    points?: number;
    options?: { text: string; isCorrect: boolean }[];
    correctAnswerText?: string;
    acceptableAnswers?: string[];
  };

  const questions: QuestionSeed[] = [
    {
      order: 1,
      type: QuestionType.MULTIPLE_CHOICE,
      topicId: topics['Database Fundamentals'].id,
      prompt:
        'Which term best describes a column (or set of columns) that uniquely identifies each row in a relational table?',
      explanation:
        'A primary key uniquely identifies each row and cannot contain duplicate or NULL values.',
      options: [
        { text: 'Primary key', isCorrect: true },
        { text: 'Foreign key', isCorrect: false },
        { text: 'Index', isCorrect: false },
        { text: 'View', isCorrect: false },
      ],
    },
    {
      order: 2,
      type: QuestionType.TRUE_FALSE,
      topicId: topics['Database Fundamentals'].id,
      prompt: 'A relational table can contain two distinct rows with the same primary key value.',
      explanation:
        'False — the primary key constraint enforces uniqueness; no two rows may share a primary key value.',
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
    {
      order: 3,
      type: QuestionType.MULTIPLE_CHOICE,
      topicId: topics['SQL Joins'].id,
      prompt:
        'You need every row from the `students` table plus matching rows from `enrollments`, with NULLs where no match exists. Which join should you use?',
      explanation:
        'A LEFT JOIN keeps every row from the left (first-listed) table regardless of whether a match exists on the right.',
      options: [
        { text: 'INNER JOIN', isCorrect: false },
        { text: 'LEFT JOIN', isCorrect: true },
        { text: 'RIGHT JOIN', isCorrect: false },
        { text: 'CROSS JOIN', isCorrect: false },
      ],
    },
    {
      order: 4,
      type: QuestionType.MULTIPLE_ANSWER,
      topicId: topics['SQL Joins'].id,
      prompt: 'Which of the following statements about SQL joins are true? (Select all that apply.)',
      explanation:
        'INNER JOIN keeps only matched rows, CROSS JOIN produces a full Cartesian product, and a self join joins a table to itself via an alias. A RIGHT JOIN keeps all rows from the right table (not just unmatched ones), so that option is false.',
      points: 2,
      options: [
        { text: 'An INNER JOIN returns only rows that have matching values in both joined tables.', isCorrect: true },
        { text: 'A CROSS JOIN produces the Cartesian product of the two tables.', isCorrect: true },
        { text: 'A RIGHT JOIN returns only unmatched rows from the left table.', isCorrect: false },
        { text: 'A self join joins a table to itself using an alias.', isCorrect: true },
      ],
    },
    {
      order: 5,
      type: QuestionType.MULTIPLE_ANSWER,
      topicId: topics['Normalization'].id,
      prompt: 'Which of the following are goals of database normalization? (Select all that apply.)',
      explanation:
        'Normalization reduces redundancy, prevents anomalies, and ensures attributes depend on the whole key. Maximizing table count for its own sake, without regard to query needs, is not a goal.',
      points: 2,
      options: [
        { text: 'Eliminating redundant data', isCorrect: true },
        { text: 'Avoiding update, insertion, and deletion anomalies', isCorrect: true },
        { text: 'Maximizing the number of tables regardless of query performance', isCorrect: false },
        { text: 'Ensuring each non-key attribute depends on the whole primary key', isCorrect: true },
      ],
    },
    {
      order: 6,
      type: QuestionType.SHORT_ANSWER,
      topicId: topics['Normalization'].id,
      prompt:
        "Which normal form requires that every non-key attribute be non-transitively dependent on the primary key — \"the key, the whole key, and nothing but the key\"?",
      explanation:
        'Third Normal Form (3NF) eliminates transitive dependencies on non-key attributes.',
      correctAnswerText: 'Third Normal Form',
      acceptableAnswers: ['Third Normal Form', '3NF', 'third normal form'],
    },
    {
      order: 7,
      type: QuestionType.SHORT_ANSWER,
      topicId: topics['Transactions'].id,
      prompt: 'Which ACID property guarantees that a transaction is executed completely or not at all?',
      explanation: 'Atomicity guarantees all-or-nothing execution of a transaction.',
      correctAnswerText: 'Atomicity',
      acceptableAnswers: ['Atomicity', 'atomicity'],
    },
    {
      order: 8,
      type: QuestionType.MULTIPLE_CHOICE,
      topicId: topics['Indexing'].id,
      prompt: 'Which data structure is most commonly used by relational databases to implement an index?',
      explanation:
        'Most relational databases implement their default index type using a balanced tree (B-tree) structure, which keeps keys sorted for efficient range and equality lookups.',
      options: [
        { text: 'Balanced tree (B-tree) with sorted keys across internal and leaf nodes', isCorrect: true },
        { text: 'Hash table with open addressing', isCorrect: false },
        { text: 'Singly linked list', isCorrect: false },
        { text: 'Unsorted array', isCorrect: false },
      ],
    },
  ];

  for (const q of questions) {
    const question = await findOrCreate(
      () => prisma.question.findFirst({ where: { quizId: quiz.id, order: q.order } }),
      () =>
        prisma.question.create({
          data: {
            quizId: quiz.id,
            topicId: q.topicId,
            type: q.type,
            prompt: q.prompt,
            points: q.points ?? 1,
            order: q.order,
            explanation: q.explanation,
            correctAnswerText: q.correctAnswerText,
            acceptableAnswers: q.acceptableAnswers ?? [],
          },
        }),
    );

    if (q.options) {
      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const existingOption = await prisma.questionOption.findFirst({
          where: { questionId: question.id, order: i + 1 },
        });
        if (!existingOption) {
          await prisma.questionOption.create({
            data: {
              questionId: question.id,
              text: opt.text,
              isCorrect: opt.isCorrect,
              order: i + 1,
            },
          });
        }
      }
    }
  }

  return quiz;
}

async function main() {
  console.log('Seeding LearnAI database...');

  const { admin, instructor, student } = await seedUsers();
  const { subject, topics } = await seedTaxonomy();
  const { course } = await seedCourse(instructor.id, subject.id, topics);
  await seedQuiz(course.id, instructor.id, topics);

  console.log('\nSeed complete.\n');
  console.log('Demo accounts (all use the same password):');
  console.log('-------------------------------------------------');
  console.log(`  ADMIN       ${admin.email}       password: ${DEMO_PASSWORD}`);
  console.log(`  INSTRUCTOR  ${instructor.email}  password: ${DEMO_PASSWORD}`);
  console.log(`  STUDENT     ${student.email}     password: ${DEMO_PASSWORD}`);
  console.log('-------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
