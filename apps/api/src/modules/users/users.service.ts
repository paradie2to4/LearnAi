import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toDto(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map((u) => this.toDto(u));
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.toDto(user);
  }

  async setRole(id: string, role: Role) {
    const user = await this.prisma.user.update({ where: { id }, data: { role } });
    return this.toDto(user);
  }

  /**
   * One-time, self-closing bootstrap: promotes the calling user to ADMIN, but only
   * while zero ADMIN accounts exist anywhere on the platform. Exists to break the
   * chicken-and-egg problem on a fresh database (PATCH /users/:id/role itself
   * requires an existing admin to call it) without needing direct database access
   * to seed one. Once any admin exists, this permanently 403s for everyone.
   */
  async bootstrapAdmin(userId: string) {
    const existingAdminCount = await this.prisma.user.count({ where: { role: Role.ADMIN } });
    if (existingAdminCount > 0) {
      throw new ForbiddenException(
        'An admin account already exists on this platform. Ask an existing admin to grant you the role via PATCH /users/:id/role.',
      );
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: { role: Role.ADMIN } });
    return this.toDto(user);
  }

  private toDto(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
