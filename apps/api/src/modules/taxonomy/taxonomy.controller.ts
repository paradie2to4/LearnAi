import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { TaxonomyService } from './taxonomy.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateTopicDto } from './dto/create-topic.dto';

@ApiTags('taxonomy')
@ApiBearerAuth()
@Controller()
export class TaxonomyController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get('subjects')
  listSubjects() {
    return this.taxonomyService.listSubjects();
  }

  @Get('topics')
  listTopics(@Query('subjectId') subjectId?: string) {
    return this.taxonomyService.listTopics(subjectId);
  }

  // Instructors can create subjects/topics too, not just admins - taxonomy is
  // shared reference data with no per-owner concept, and requiring an admin to
  // exist first (bootstrap chicken-and-egg on a fresh database) would block an
  // instructor from ever creating their first course.
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('subjects')
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.taxonomyService.createSubject(dto);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('topics')
  createTopic(@Body() dto: CreateTopicDto) {
    return this.taxonomyService.createTopic(dto);
  }
}
