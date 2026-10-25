import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  hello1() {
    return 'hello';
  }
}
