import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let jwtService: JwtService;
  let configService: ConfigService;
  let service: AuthService;

  const baseUser = {
    id: 'user-1',
    email: 'student@example.com',
    passwordHash: '',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: Role.STUDENT,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } as unknown as JwtService;
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_ACCESS_SECRET: 'access-secret',
          JWT_ACCESS_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    service = new AuthService(prisma, jwtService, configService);
  });

  describe('register', () => {
    it('creates a new user with a hashed password and returns tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const hashedPassword = await bcrypt.hash('Str0ng!Passw0rd', 4);
      prisma.user.create.mockResolvedValue({ ...baseUser, passwordHash: hashedPassword });
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.register({
        email: baseUser.email,
        password: 'Str0ng!Passw0rd',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toHaveLength(96);
      expect(result.user.email).toBe(baseUser.email);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);

      const createArgs = prisma.user.create.mock.calls[0][0] as any;
      expect(createArgs.data.passwordHash).not.toBe('Str0ng!Passw0rd');
    });

    it('rejects registration when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(
        service.register({
          email: baseUser.email,
          password: 'Str0ng!Passw0rd',
          firstName: 'Ada',
          lastName: 'Lovelace',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues tokens for correct credentials', async () => {
      const passwordHash = await bcrypt.hash('Str0ng!Passw0rd', 4);
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.login({ email: baseUser.email, password: 'Str0ng!Passw0rd' });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.id).toBe(baseUser.id);
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect password without revealing which field was wrong', async () => {
      const passwordHash = await bcrypt.hash('Str0ng!Passw0rd', 4);
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      await expect(
        service.login({ email: baseUser.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });

      await expect(
        service.login({ email: baseUser.email, password: 'Str0ng!Passw0rd' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token: issues a new one and revokes the old', async () => {
      const storedToken = {
        id: 'refresh-1',
        userId: baseUser.id,
        tokenHash: 'irrelevant-because-hash-is-recomputed',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: null,
        replacedByTokenId: null,
        createdByIp: null,
        createdAt: new Date(),
        user: baseUser,
      };
      // The service recomputes the hash of the raw token it was given, so we
      // make findUnique resolve regardless of the exact hash value.
      prisma.refreshToken.findUnique.mockImplementation(((args: any) => {
        if (args.include) return Promise.resolve(storedToken as any);
        return Promise.resolve({ id: 'refresh-2' } as any);
      }) as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);
      prisma.refreshToken.update.mockResolvedValue({} as any);

      const result = await service.refresh('some-raw-refresh-token');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'refresh-1' },
          data: expect.objectContaining({ replacedByTokenId: 'refresh-2' }),
        }),
      );
    });

    it('rejects an expired refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        userId: baseUser.id,
        tokenHash: 'x',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        replacedByTokenId: null,
        createdByIp: null,
        createdAt: new Date(),
        user: baseUser,
      } as any);

      await expect(service.refresh('expired-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an already-revoked refresh token (reuse detection)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        userId: baseUser.id,
        tokenHash: 'x',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: new Date(),
        replacedByTokenId: 'refresh-2',
        createdByIp: null,
        createdAt: new Date(),
        user: baseUser,
      } as any);

      await expect(service.refresh('reused-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the matching, currently-active refresh token', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);

      await service.logout('some-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
