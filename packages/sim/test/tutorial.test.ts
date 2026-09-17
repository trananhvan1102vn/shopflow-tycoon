import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { tutorialAdvance, tutorialSkip, tutorialClaim, tutorialReset, TUTORIAL_STEPS } from '../src/tutorial.js';
import { stages as ST } from '@shopflow/data';

describe('tutorial', () => {
  it('advance caps at 8; claim pays once', () => {
    let s = createGame(42, 'electronics');
    for (let i = 0; i < 10; i++) s = tutorialAdvance(s);
    expect(s.tutorial.step).toBe(TUTORIAL_STEPS);
    expect(tutorialClaim(createGame(42, 'electronics')).lastReject).toBeTruthy(); // chưa tới bước 8
    s = tutorialClaim(s);
    expect(s.money).toBe(100000 + ST.tutorialReward);
    expect(s.tutorial).toEqual({ step: 8, done: true, rewarded: true });
    expect(tutorialClaim(s).lastReject).toBeTruthy();
  });
  it('skip: done without reward; reset replays without paying twice', () => {
    let s = tutorialSkip(createGame(42, 'electronics'));
    expect(s.tutorial).toEqual({ step: 0, done: true, rewarded: false });
    s = tutorialReset(s);
    expect(s.tutorial).toEqual({ step: 0, done: false, rewarded: false });
    for (let i = 0; i < 8; i++) s = tutorialAdvance(s);
    s = tutorialClaim(s);
    expect(s.money).toBe(100000 + ST.tutorialReward);
    s = tutorialReset(s);
    expect(s.tutorial.rewarded).toBe(true);
    for (let i = 0; i < 8; i++) s = tutorialAdvance(s);
    expect(tutorialClaim(s).lastReject).toBeTruthy();
  });
});
