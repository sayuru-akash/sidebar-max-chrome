/* eslint-disable @typescript-eslint/no-unsafe-call */

import { defineBackground } from '#imports';

import { DockBackgroundController } from '../src/background/controller';

export default defineBackground(() => {
  const controller = new DockBackgroundController();
  void controller.start();
});
