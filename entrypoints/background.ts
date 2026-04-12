/* eslint-disable @typescript-eslint/no-unsafe-call */

import { defineBackground } from '#imports';

import { SidePanelController } from '../src/background/controller';

export default defineBackground(() => {
  const controller = new SidePanelController();
  void controller.start();
});
