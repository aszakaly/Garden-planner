import { describe, expect, it } from 'vitest';
import { plantingInput } from '@shared/schemas.ts';
import { blankPlanting, plantingInputOf } from './plantingView.ts';

describe('plantingInputOf', () => {
  it('a bemeneti séma minden mezőjét kitölti (egy új mező nem nullázódhat le csendben a teljes cserénél)', () => {
    expect(Object.keys(plantingInputOf(blankPlanting())).sort()).toEqual(Object.keys(plantingInput.shape).sort());
  });
});
