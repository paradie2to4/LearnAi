import { ForbiddenException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService.bootstrapAdmin', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: UsersService;

  const baseUser = {
    id: 'user-1',
    email: 'first@example.com',
    passwordHash: 'hashed',
    firstName: 'First',
    lastName: 'User',
    role: Role.STUDENT,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new UsersService(prisma);
  });

  it('promotes the caller to ADMIN when no admin exists yet', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.update.mockResolvedValue({ ...baseUser, role: Role.ADMIN });

    const result = await service.bootstrapAdmin('user-1');

    expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: Role.ADMIN } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: Role.ADMIN },
    });
    expect(result.role).toBe(Role.ADMIN);
  });

  it('refuses to promote once an admin already exists', async () => {
    prisma.user.count.mockResolvedValue(1);

    await expect(service.bootstrapAdmin('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses even for a second caller racing right after the first admin is created', async () => {
    prisma.user.count.mockResolvedValue(2);

    await expect(service.bootstrapAdmin('user-2')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
