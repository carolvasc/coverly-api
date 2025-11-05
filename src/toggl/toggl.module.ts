import { Module } from '@nestjs/common';
import { TogglController } from './toggl.controller';
import { TogglService } from './toggl.service';

@Module({
  controllers: [TogglController],
  providers: [TogglService],
})
export class TogglModule {}
