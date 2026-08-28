import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaxonomyService } from './taxonomy.service';

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
}
