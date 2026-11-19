import { useSyncExternalStore } from 'react';
import { learnerStore, type LearnerStore } from './learner';

/** Subscribe a React component to the learner store (server snapshot is the empty initial state). */
export function useLearner(): LearnerStore {
  return useSyncExternalStore(learnerStore.subscribe, learnerStore.getState, learnerStore.getState);
}
