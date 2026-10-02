import { Injectable } from '@nestjs/common';
import { hello } from '@mono/ai-core';

@Injectable()
export class AppService {
  hello1() {
    return 'hello';
  }
}
