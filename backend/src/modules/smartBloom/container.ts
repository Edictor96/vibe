import {ContainerModule} from 'inversify';
import {SMART_BLOOM_TYPES} from './types.js';
import {SmartBloomDirectService} from './services/SmartBloomDirectService.js';
import {YouTubeCaptionService} from './services/YouTubeCaptionService.js';
import {MinimaxClient} from './services/MinimaxClient.js';
import {SmartBloomDirectController} from './controllers/SmartBloomDirectController.js';

export const smartBloomContainerModule = new ContainerModule(options => {
  options
    .bind(SMART_BLOOM_TYPES.YouTubeCaptionService)
    .to(YouTubeCaptionService)
    .inSingletonScope();
  options
    .bind(SMART_BLOOM_TYPES.MinimaxClient)
    .to(MinimaxClient)
    .inSingletonScope();
  options
    .bind(SMART_BLOOM_TYPES.SmartBloomDirectService)
    .to(SmartBloomDirectService)
    .inSingletonScope();
  options.bind(SmartBloomDirectController).toSelf().inSingletonScope();
});
