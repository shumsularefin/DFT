import { accuracyRules } from './accuracy';
import { bandRules } from './bands';
import { dftuRules } from './dftu';
import { functionalRules } from './functional';
import { ionicRules } from './ionic';
import { magnetismRules } from './magnetism';
import { parallelRules } from './parallel';
import { restartRules } from './restart';
import { smearingRules } from './smearing';
import type { Rule } from './types';

/** Every rule, sorted by id. */
export const ALL_RULES: readonly Rule[] = [
  ...magnetismRules,
  ...smearingRules,
  ...accuracyRules,
  ...ionicRules,
  ...dftuRules,
  ...functionalRules,
  ...restartRules,
  ...bandRules,
  ...parallelRules,
].sort((a, b) => a.id.localeCompare(b.id));
